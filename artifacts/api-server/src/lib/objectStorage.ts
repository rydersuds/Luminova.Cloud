import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Storage, type File } from "@google-cloud/storage";
import { canAccessObject, getObjectAclPolicy, setObjectAclPolicy, type ObjectAclPolicy, ObjectPermission } from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

function parseObjectPath(path: string) {
  const parts = `/${path}`.replace(/^\/+/, "/").split("/");
  if (parts.length < 3) throw new Error("Invalid object path");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

export class ObjectStorageService {
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR;
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not configured");
    return dir;
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const { bucketName, objectName } = parseObjectPath(
      `${this.getPrivateObjectDir()}/uploads/${randomUUID()}`,
    );
    const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method: "PUT",
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Failed to sign object URL (${response.status})`);
    const body = await response.json() as { signed_url: string };
    return body.signed_url;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    const url = new URL(rawPath);
    const privateDir = this.getPrivateObjectDir().replace(/\/$/, "");
    const fullPath = url.pathname;
    if (!fullPath.startsWith(`${privateDir}/`)) throw new Error("Upload URL is outside private storage");
    return `/objects/${fullPath.slice(privateDir.length + 1)}`;
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const relativePath = objectPath.slice("/objects/".length);
    if (!relativePath || relativePath.includes("..")) throw new ObjectNotFoundError();
    const { bucketName, objectName } = parseObjectPath(`${this.getPrivateObjectDir()}/${relativePath}`);
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async setAcl(objectPath: string, policy: ObjectAclPolicy): Promise<void> {
    await setObjectAclPolicy(await this.getObjectEntityFile(objectPath), policy);
  }

  async deleteObject(objectPath: string): Promise<void> {
    const file = await this.getObjectEntityFile(objectPath);
    await file.delete({ ignoreNotFound: true });
  }

  async verifyPanorama(objectPath: string): Promise<void> {
    const file = await this.getObjectEntityFile(objectPath);
    const [metadata] = await file.getMetadata();
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(String(metadata.contentType)) || Number(metadata.size) > 8 * 1024 * 1024) {
      throw new Error("Stored object is not a supported panorama image");
    }
  }

  async verifyScheduleImage(input: {
    objectPath: string;
    size: number;
    contentType: string;
  }): Promise<void> {
    const file = await this.getObjectEntityFile(input.objectPath);
    const [metadata] = await file.getMetadata();
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(input.contentType) ||
      input.size > 8 * 1024 * 1024 ||
      Number(metadata.size) !== input.size ||
      String(metadata.contentType || "application/octet-stream") !== input.contentType) {
      throw new Error("Stored object is not a supported schedule image or its metadata does not match");
    }
  }

  async verifyClientLogo(objectPath: string): Promise<void> {
    const file = await this.getObjectEntityFile(objectPath);
    const [metadata] = await file.getMetadata();
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(String(metadata.contentType)) || Number(metadata.size) > 8 * 1024 * 1024) {
      throw new Error("Stored object is not a supported client logo image");
    }
  }

  async verifyConstructionDocument(input: { objectPath: string; name: string; size: number; contentType: string }): Promise<void> {
    const file = await this.getObjectEntityFile(input.objectPath);
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) !== input.size ||
      String(metadata.contentType || "application/octet-stream") !== input.contentType) {
      throw new Error("Stored object metadata does not match the project file");
    }
  }

  async canRead(userId: string | undefined, file: File, workspaceId?: string): Promise<boolean> {
    return canAccessObject({ userId, workspaceId, objectFile: file, requestedPermission: ObjectPermission.READ });
  }

  async downloadObject(file: File): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const policy = await getObjectAclPolicy(file);
    const stream = Readable.toWeb(file.createReadStream()) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": String(metadata.contentType || "application/octet-stream"),
        "Cache-Control": `${policy?.visibility === "public" ? "public" : "private"}, max-age=3600`,
        ...(metadata.size ? { "Content-Length": String(metadata.size) } : {}),
      },
    });
  }
}