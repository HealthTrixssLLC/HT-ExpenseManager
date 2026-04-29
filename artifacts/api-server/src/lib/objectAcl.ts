import { File } from "@google-cloud/storage";

/**
 * Object-level ACL helpers for receipts.
 *
 * Authorization for receipts is enforced at the *application* layer — every
 * download goes through an Express handler that checks the parent report's
 * visibility. This file only stores a tiny owner/visibility metadata blob on
 * the object so we can:
 *
 *   - Mark a small set of objects as world-readable (org logos, etc.).
 *   - Recover the uploader id without a DB lookup if we ever need to.
 *
 * We deliberately do *not* implement a generic group-based ACL system here.
 * Receipt access is governed by the report state machine, not by per-object
 * group membership.
 */

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

// Stored as object custom metadata under "custom:aclPolicy" (JSON string).
export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
}

export async function setObjectAclPolicy(
  objectFile: File,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  const [exists] = await objectFile.exists();
  if (!exists) {
    throw new Error(`Object not found: ${objectFile.name}`);
  }

  await objectFile.setMetadata({
    metadata: {
      [ACL_POLICY_METADATA_KEY]: JSON.stringify(aclPolicy),
    },
  });
}

export async function getObjectAclPolicy(
  objectFile: File,
): Promise<ObjectAclPolicy | null> {
  const [metadata] = await objectFile.getMetadata();
  const aclPolicy = metadata?.metadata?.[ACL_POLICY_METADATA_KEY];
  if (!aclPolicy) {
    return null;
  }
  return JSON.parse(aclPolicy as string);
}

export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: File;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) return false;
  if (
    aclPolicy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }
  if (!userId) return false;
  return aclPolicy.owner === userId;
}
