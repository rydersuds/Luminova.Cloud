import type { File } from "@google-cloud/storage";

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export async function setObjectAclPolicy(file: File, policy: ObjectAclPolicy): Promise<void> {
  const [exists] = await file.exists();
  if (!exists) throw new Error(`Object not found: ${file.name}`);
  await file.setMetadata({ metadata: { [ACL_POLICY_METADATA_KEY]: JSON.stringify(policy) } });
}

export async function getObjectAclPolicy(file: File): Promise<ObjectAclPolicy | null> {
  const [metadata] = await file.getMetadata();
  const raw = metadata.metadata?.[ACL_POLICY_METADATA_KEY];
  return raw ? JSON.parse(String(raw)) : null;
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
  const policy = await getObjectAclPolicy(objectFile);
  if (!policy) return false;
  if (policy.visibility === "public" && requestedPermission === ObjectPermission.READ) return true;
  return Boolean(userId && policy.owner === userId);
}