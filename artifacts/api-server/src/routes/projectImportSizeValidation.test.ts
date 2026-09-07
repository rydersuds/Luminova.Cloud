import assert from "node:assert/strict";
import test from "node:test";
import {
  AttachProjectImportDocumentBody,
  CreateProjectImportSessionBody,
  RequestUploadUrlBody,
} from "@workspace/api-zod";
import { uploadMatchesImportManifest } from "./storage";

const largeFileSize = 500 * 1024 * 1024;

test("project import contracts accept file metadata larger than 200 MB", () => {
  assert.equal(RequestUploadUrlBody.safeParse({
    name: "plans.pdf",
    size: largeFileSize,
    contentType: "application/pdf",
    relativePath: "Plans/plans.pdf",
  }).success, true);

  assert.equal(CreateProjectImportSessionBody.safeParse({
    documents: [{
      relativePath: "Plans/plans.pdf",
      name: "plans.pdf",
      size: largeFileSize,
      contentType: "application/pdf",
    }],
  }).success, true);

  assert.equal(AttachProjectImportDocumentBody.safeParse({
    relativePath: "Plans/plans.pdf",
    objectPath: "/objects/uploads/large-plans",
    name: "plans.pdf",
    size: largeFileSize,
    contentType: "application/pdf",
  }).success, true);
});

test("project import contracts continue to reject non-positive file sizes", () => {
  assert.equal(RequestUploadUrlBody.safeParse({
    name: "plans.pdf",
    size: 0,
    contentType: "application/pdf",
  }).success, false);

  assert.equal(CreateProjectImportSessionBody.safeParse({
    documents: [{
      relativePath: "Plans/plans.pdf",
      name: "plans.pdf",
      size: 0,
      contentType: "application/pdf",
    }],
  }).success, false);
});

test("project import contracts accept video, uncommon, and extensionless metadata", () => {
  for (const document of [
    { relativePath: "Records/walkthrough.mp4", name: "walkthrough.mp4", size: 2048, contentType: "video/mp4" },
    { relativePath: "Survey/point-cloud.las", name: "point-cloud.las", size: 1024, contentType: "application/octet-stream" },
    { relativePath: "Records/SITE_NOTES", name: "SITE_NOTES", size: 512, contentType: "application/octet-stream" },
  ]) {
    assert.equal(RequestUploadUrlBody.safeParse(document).success, true);
    assert.equal(CreateProjectImportSessionBody.safeParse({ documents: [document] }).success, true);
  }
});

test("upload authorization metadata must match the owned import manifest entry", () => {
  const expected = {
    relativePath: "Records/walkthrough.mp4",
    name: "walkthrough.mp4",
    size: 2048,
    contentType: "video/mp4",
  };
  assert.equal(uploadMatchesImportManifest(expected, [expected]), true);
  assert.equal(uploadMatchesImportManifest({ ...expected, size: 2049 }, [expected]), false);
  assert.equal(uploadMatchesImportManifest({ ...expected, contentType: "application/octet-stream" }, [expected]), false);
  assert.equal(uploadMatchesImportManifest({ ...expected, relativePath: "Other/walkthrough.mp4" }, [expected]), false);
});