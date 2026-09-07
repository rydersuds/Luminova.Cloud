import assert from "node:assert/strict";
import test from "node:test";
import type { File } from "@google-cloud/storage";
import { ObjectStorageService } from "./objectStorage";

class ConstructionDocumentStorage extends ObjectStorageService {
  constructor(
    private readonly metadata: { size: string; contentType: string },
  ) {
    super();
  }

  override async getObjectEntityFile(): Promise<File> {
    return {
      getMetadata: async () => [this.metadata],
    } as unknown as File;
  }
}

test("construction document verification accepts matching objects larger than 200 MB", async () => {
  const size = 500 * 1024 * 1024;
  const storage = new ConstructionDocumentStorage({
    size: String(size),
    contentType: "application/pdf",
  });

  await assert.doesNotReject(storage.verifyConstructionDocument({
    objectPath: "/objects/uploads/large-plans",
    name: "plans.pdf",
    size,
    contentType: "application/pdf",
  }));
});

test("construction document verification still rejects mismatched or unsupported objects", async () => {
  const storage = new ConstructionDocumentStorage({
    size: "1024",
    contentType: "application/pdf",
  });

  await assert.rejects(storage.verifyConstructionDocument({
    objectPath: "/objects/uploads/mismatched-plans",
    name: "plans.pdf",
    size: 2048,
    contentType: "application/pdf",
  }));

  await assert.rejects(storage.verifyConstructionDocument({
    objectPath: "/objects/uploads/unsupported-plans",
    name: "plans.exe",
    size: 1024,
    contentType: "application/pdf",
  }));
});