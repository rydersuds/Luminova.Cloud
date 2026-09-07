import assert from "node:assert/strict";
import test from "node:test";
import {
  AttachProjectImportDocumentBody,
  CreateProjectImportSessionBody,
  RequestUploadUrlBody,
} from "@workspace/api-zod";

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