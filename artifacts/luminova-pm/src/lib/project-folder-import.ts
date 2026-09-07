const SUPPORTED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "md", "json", "rtf",
  "jpg", "jpeg", "png", "webp", "heic", "tif", "tiff",
])

const TEXT_EXTENSIONS = new Set(["csv", "txt", "md", "json", "rtf"])

export type FolderCandidate = {
  file: File
  relativePath: string
}

export type SkippedFolderFile = {
  name: string
  reason: string
}

type BatchImportResponseContext = {
  operation: string
  fileName?: string
  expectsJson?: boolean
}

const payloadLimitPattern = /\b(?:413|content too large|entity too large|payload too large|request too large|max(?:imum)? (?:request|body|payload|upload|file) size|size limit)\b/i

const responseSubject = ({ operation, fileName }: BatchImportResponseContext) =>
  fileName ? `${operation} for "${fileName}"` : operation

export async function readBatchImportResponse<T>(
  response: Response,
  context: BatchImportResponseContext,
): Promise<T> {
  const text = await response.text()
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
  const expectsJson = context.expectsJson !== false
  const subject = responseSubject(context)
  let body: unknown

  if (text && (contentType.includes("application/json") || contentType.includes("+json"))) {
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(`${subject} returned an unreadable response. Please retry the import.`)
    }
  }

  if (!response.ok) {
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string" && body.error.trim()) {
      throw new Error(body.error)
    }
    if (response.status === 413 || payloadLimitPattern.test(text)) {
      throw new Error(`${subject} was blocked by an external platform size limit. Try a smaller file or retry after checking the hosting upload limits.`)
    }
    throw new Error(`${subject} failed (HTTP ${response.status}). Please retry the import.`)
  }

  if (!expectsJson) return undefined as T
  if (!text) throw new Error(`${subject} returned an empty response. Please retry the import.`)
  if (body === undefined) throw new Error(`${subject} returned an unexpected response. Please retry the import.`)
  return body as T
}

export const normalizeRelativePath = (value: string): string | null => {
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null
  const path = value.replace(/\\/g, "/")
  if (path.startsWith("/") || /^[a-zA-Z]:\//.test(path)) return null
  const segments = path.split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null
  return segments.join("/")
}

export const extensionFor = (name: string) => name.split(".").pop()?.toLowerCase() ?? ""

export const folderFileIssue = (file: File, relativePath: string): string | null => {
  if (!normalizeRelativePath(relativePath)) return "Unsafe relative path"
  if (!SUPPORTED_EXTENSIONS.has(extensionFor(file.name))) return "Unsupported file type"
  if (!Number.isSafeInteger(file.size) || file.size < 1) return "File must not be empty"
  return null
}

export const isBrowserExtractableText = (file: File) => TEXT_EXTENSIONS.has(extensionFor(file.name))

export const boundedTextSnippet = async (file: File, maxBytes = 24_000): Promise<string | undefined> => {
  if (!isBrowserExtractableText(file)) return undefined
  return file.slice(0, maxBytes).text()
}