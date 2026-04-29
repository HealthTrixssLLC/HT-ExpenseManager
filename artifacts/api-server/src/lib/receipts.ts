// Server-side receipt validation. Centralised so both
// `POST /receipts/upload-url` (signed-PUT minting) and the registration
// routes (`POST /reports/:id/receipts`, `POST /lines/:lineId/receipts`)
// agree on the rules.
//
// The signed PUT URL itself does not constrain content-type or size, so the
// authoritative enforcement happens at registration: we ask the storage
// backend for the actual recorded `size` + `contentType` of the uploaded
// object and reject anything outside the allowlist or over 10 MB.

import { ObjectNotFoundError, ObjectStorageService } from "./objectStorage";

export const ALLOWED_RECEIPT_MIME = new Set<string>([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "application/pdf",
]);

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB

export const RECEIPT_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export type ValidatedReceiptUpload =
  | { ok: true; ext: string }
  | { ok: false; status: number; title: string; detail: string };

export function validateReceiptUpload(
  size: number,
  contentType: string,
): ValidatedReceiptUpload {
  const mime = contentType.toLowerCase();
  if (!ALLOWED_RECEIPT_MIME.has(mime)) {
    return {
      ok: false,
      status: 415,
      title: "Unsupported Media Type",
      detail: `Receipts must be one of: ${[...ALLOWED_RECEIPT_MIME].join(", ")}.`,
    };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return {
      ok: false,
      status: 400,
      title: "Invalid Size",
      detail: "size must be a positive integer (bytes).",
    };
  }
  if (size > MAX_RECEIPT_BYTES) {
    return {
      ok: false,
      status: 413,
      title: "Payload Too Large",
      detail: `Receipts are limited to 10 MB (got ${size} bytes).`,
    };
  }
  const ext = RECEIPT_EXT_BY_MIME[mime];
  if (!ext) {
    return {
      ok: false,
      status: 415,
      title: "Unsupported Media Type",
      detail: `No file extension mapping for content type ${mime}.`,
    };
  }
  return { ok: true, ext };
}

// `/objects/org/{orgId}/reports/{reportId}/receipts/{receiptId}.{ext}`
const CANONICAL_RECEIPT_PATH =
  /^\/objects\/org\/([^/]+)\/reports\/([^/]+)\/receipts\/([^/.]+)\.([a-z0-9]{1,8})$/;

export interface ParsedReceiptPath {
  orgId: string;
  reportId: string;
  receiptId: string;
  ext: string;
}

export function parseReceiptObjectPath(
  path: string,
): ParsedReceiptPath | null {
  const m = CANONICAL_RECEIPT_PATH.exec(path);
  if (!m) return null;
  return { orgId: m[1], reportId: m[2], receiptId: m[3], ext: m[4] };
}

export type VerifiedUpload =
  | {
      ok: true;
      contentType: string;
      sizeBytes: number;
      parsed: ParsedReceiptPath;
    }
  | { ok: false; status: number; title: string; detail: string };

/**
 * Authoritative server-side check applied at receipt registration time.
 * Verifies:
 *   1. `objectPath` matches the canonical receipt key scheme.
 *   2. The `orgId` and `reportId` embedded in the key match the caller's org
 *      and the report the receipt is being attached to.
 *   3. The actual object exists in storage.
 *   4. The actual content-type is in the allowlist and the actual size is
 *      ≤ 10 MB — regardless of what the client claimed.
 */
export async function verifyReceiptUpload(args: {
  objectStorage: ObjectStorageService;
  objectPath: string;
  expectedOrgId: string;
  expectedReportId: string;
}): Promise<VerifiedUpload> {
  const parsed = parseReceiptObjectPath(args.objectPath);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      title: "Invalid Object Path",
      detail:
        "objectPath must be of the form /objects/org/{orgId}/reports/{reportId}/receipts/{receiptId}.{ext}.",
    };
  }
  if (parsed.orgId !== args.expectedOrgId) {
    return {
      ok: false,
      status: 403,
      title: "Forbidden",
      detail: "objectPath belongs to a different organization.",
    };
  }
  if (parsed.reportId !== args.expectedReportId) {
    return {
      ok: false,
      status: 400,
      title: "Object/Report Mismatch",
      detail:
        "objectPath was minted for a different report than the one it is being attached to.",
    };
  }
  let metadata: { contentType: string; size: number };
  try {
    metadata = await args.objectStorage.getObjectMetadata(args.objectPath);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      return {
        ok: false,
        status: 404,
        title: "Object Not Found",
        detail: "No uploaded object exists at that path.",
      };
    }
    throw err;
  }
  const v = validateReceiptUpload(metadata.size, metadata.contentType);
  if (!v.ok) return v;
  return {
    ok: true,
    contentType: metadata.contentType.toLowerCase(),
    sizeBytes: metadata.size,
    parsed,
  };
}
