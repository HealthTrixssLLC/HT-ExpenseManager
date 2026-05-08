import { Storage, File } from "@google-cloud/storage";
import { Readable } from "stream";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(file: File, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  /**
   * Build the canonical receipt key:
   *
   *   ${PRIVATE_OBJECT_DIR}/org/{orgId}/reports/{reportId}/receipts/{receiptId}.{ext}
   *
   * and return both the signed PUT URL and the `objectPath` the client should
   * pass back when registering the receipt row. The receipt id is generated
   * server-side so clients cannot collide their own keys with someone else's.
   */
  async getReceiptUploadURL(args: {
    orgId: string;
    reportId: string;
    receiptId: string;
    ext: string;
  }): Promise<{ uploadURL: string; objectPath: string; expiresAt: Date }> {
    const privateObjectDir = this.getPrivateObjectDir();
    const cleanExt = args.ext.replace(/^\.+/, "").toLowerCase();
    if (!cleanExt || !/^[a-z0-9]{1,8}$/.test(cleanExt)) {
      throw new Error(`Invalid receipt extension: ${args.ext}`);
    }
    const tail = `org/${args.orgId}/reports/${args.reportId}/receipts/${args.receiptId}.${cleanExt}`;
    const fullPath = `${privateObjectDir.replace(/\/+$/, "")}/${tail}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const ttlSec = 900;
    const uploadURL = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec,
    });
    return {
      uploadURL,
      objectPath: `/objects/${tail}`,
      expiresAt: new Date(Date.now() + ttlSec * 1000),
    };
  }

  /**
   * Returns a short-lived signed GET URL for an existing object. Used by the
   * `GET /receipts/{id}/download-url` endpoint after the caller has been
   * authorized via the report-level ACL check in the route handler.
   */
  async getSignedDownloadURL(
    objectPath: string,
    ttlSec = 600,
  ): Promise<{ downloadURL: string; expiresAt: Date }> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const tail = objectPath.slice("/objects/".length);
    const privateObjectDir = this.getPrivateObjectDir().replace(/\/+$/, "");
    const fullPath = `${privateObjectDir}/${tail}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const downloadURL = await signObjectURL({
      bucketName,
      objectName,
      method: "GET",
      ttlSec,
    });
    return {
      downloadURL,
      expiresAt: new Date(Date.now() + ttlSec * 1000),
    };
  }

  /**
   * Look up the actual size + content type the storage backend recorded for an
   * uploaded object. Used at receipt-registration time so we never trust the
   * client's claimed `mimeType`/`sizeBytes` — the signed PUT URL itself does
   * not constrain these, so the only place we can authoritatively enforce the
   * 10 MB / allowed-MIME rules is here, after the upload has actually landed.
   */
  async getObjectMetadata(
    objectPath: string,
  ): Promise<{ contentType: string; size: number }> {
    const file = await this.getObjectEntityFile(objectPath);
    const [metadata] = await file.getMetadata();
    return {
      contentType:
        (metadata.contentType as string | undefined) ??
        "application/octet-stream",
      size: Number(metadata.size ?? 0),
    };
  }

  /**
   * Hard-delete a single object by its canonical `/objects/<id>` path.
   * Returns `true` when the blob was removed and `false` when the object
   * did not exist in the first place — both cases are treated as "the
   * blob is gone now" by the system-reset flow. Any other error
   * propagates so callers can collect it as a warning.
   */
  async deleteObjectEntity(objectPath: string): Promise<boolean> {
    try {
      const file = await this.getObjectEntityFile(objectPath);
      await file.delete({ ignoreNotFound: true });
      return true;
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        return false;
      }
      throw err;
    }
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = (await response.json()) as { signed_url: string };
  return signedURL;
}
