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