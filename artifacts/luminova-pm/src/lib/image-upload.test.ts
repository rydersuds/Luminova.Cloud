import assert from "node:assert/strict"
import test from "node:test"
import { MAX_IMAGE_BYTES, validateImageFile } from "./image-upload.ts"

const image = (type: string, size = 1024) => ({ type, size } as File)

test("image validation accepts supported image types and returns the narrowed type", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"] as const) {
    assert.deepEqual(validateImageFile(image(type)), { valid: true, contentType: type })
  }
})

test("image validation rejects unsupported types and oversized files", () => {
  assert.equal(validateImageFile(image("image/gif")).issue, "unsupported-type")
  assert.equal(validateImageFile(image("image/svg+xml")).issue, "unsupported-type")
  assert.equal(validateImageFile(image("image/png", MAX_IMAGE_BYTES + 1)).issue, "too-large")
})

test("image validation supports a minimum size and custom messages", () => {
  const result = validateImageFile(image("image/png", 0), {
    minBytes: 1,
    messages: { "too-small": "This upload cannot be empty." },
  })
  assert.deepEqual(result, {
    valid: false,
    issue: "too-small",
    message: "This upload cannot be empty.",
  })
})