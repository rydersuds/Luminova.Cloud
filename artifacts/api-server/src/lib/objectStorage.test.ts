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

test("project file verification accepts video, uncommon, and extensionless objects", async () => {
  const cases = [
    { name: "walkthrough.mp4", contentType: "video/mp4" },
    { name: "point-cloud.las", contentType: "application/octet-stream" },
    { name: "SITE_NOTES", contentType: "application/octet-stream" },
  ];
  for (const candidate of cases) {
    const storage = new ConstructionDocumentStorage({ size: "1024", contentType: candidate.contentType });
    await assert.doesNotReject(storage.verifyConstructionDocument({
      objectPath: "/objects/uploads/arbitrary-file",
      name: candidate.name,
      size: 1024,
      contentType: candidate.contentType,
    }));
  }
});

test("project file verification still rejects mismatched object metadata", async () => {
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
    objectPath: "/objects/uploads/wrong-content-type",
    name: "plans.pdf",
    size: 1024,
    contentType: "application/octet-stream",
  }));
});

test("schedule image verification accepts supported images with matching metadata", async () => {
  const storage = new ConstructionDocumentStorage({
    size: "2048",
    contentType: "image/png",
  });

  await assert.doesNotReject(storage.verifyScheduleImage({
    objectPath: "/objects/uploads/schedule-image",
    size: 2048,
    contentType: "image/png",
  }));
});

test("schedule image verification rejects unsupported, oversized, and mismatched objects", async () => {
  const unsupported = new ConstructionDocumentStorage({ size: "2048", contentType: "application/pdf" });
  await assert.rejects(unsupported.verifyScheduleImage({
    objectPath: "/objects/uploads/schedule-pdf",
    size: 2048,
    contentType: "application/pdf",
  }));

  const oversized = new ConstructionDocumentStorage({
    size: String(8 * 1024 * 1024 + 1),
    contentType: "image/jpeg",
  });
  await assert.rejects(oversized.verifyScheduleImage({
    objectPath: "/objects/uploads/large-schedule",
    size: 8 * 1024 * 1024 + 1,
    contentType: "image/jpeg",
  }));

  const mismatched = new ConstructionDocumentStorage({ size: "2048", contentType: "image/png" });
  await assert.rejects(mismatched.verifyScheduleImage({
    objectPath: "/objects/uploads/wrong-schedule",
    size: 1024,
    contentType: "image/png",
  }));
});