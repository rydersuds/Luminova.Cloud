import assert from "node:assert/strict"

const previewOrigin = process.env.PREVIEW_ORIGIN
  ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:80")
const requestPath = "/api/project-import-sessions"
const request = {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-preview-routing-check": "project-import-session",
  },
  body: JSON.stringify({ documents: [] }),
  redirect: "manual" as const,
}

let response: Awaited<ReturnType<typeof fetch>> | undefined
let lastError: unknown
for (let attempt = 0; attempt < 10; attempt += 1) {
  try {
    response = await fetch(new URL(requestPath, previewOrigin), request)
    if (response.status !== 502) break
  } catch (error) {
    lastError = error
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
}

assert.ok(response, `Preview routing request failed: ${String(lastError)}`)
const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
const text = await response.text()

assert.notEqual(response.status, 404, `${requestPath} returned 404 through the shared preview proxy`)
assert.ok(
  contentType.includes("application/json"),
  `${requestPath} reached a non-API service (${response.status}, ${contentType || "no content type"})`,
)
assert.equal(
  response.headers.get("x-powered-by"),
  "Express",
  `${requestPath} did not reach the API Server artifact`,
)

if (response.status === 401) {
  assert.deepEqual(JSON.parse(text), { error: "Authentication required" })
} else {
  assert.ok(
    response.status === 201 || response.status === 400,
    `${requestPath} reached the API but returned unexpected HTTP ${response.status}: ${text}`,
  )
}

process.stdout.write(
  `${requestPath} reached the API Server through ${previewOrigin} (HTTP ${response.status}).\n`,
)