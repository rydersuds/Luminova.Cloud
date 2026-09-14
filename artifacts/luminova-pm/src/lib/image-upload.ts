export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number]

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export type ImageValidationIssue = "unsupported-type" | "too-small" | "too-large"

export type ImageValidationResult =
  | { valid: true; contentType: SupportedImageType }
  | { valid: false; issue: ImageValidationIssue; message: string }

type ImageValidationMessages = Partial<Record<ImageValidationIssue, string>>

export function validateImageFile(
  file: File,
  options: {
    minBytes?: number
    maxBytes?: number
    messages?: ImageValidationMessages
  } = {},
): ImageValidationResult {
  const messages = {
    "unsupported-type": "Choose a JPEG, PNG, or WebP image.",
    "too-small": "Choose a non-empty image.",
    "too-large": "Choose an image that is 8 MB or smaller.",
    ...options.messages,
  }
  const minBytes = options.minBytes ?? 0
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES

  if (!SUPPORTED_IMAGE_TYPES.includes(file.type as SupportedImageType)) {
    return { valid: false, issue: "unsupported-type", message: messages["unsupported-type"] }
  }
  if (file.size < minBytes) {
    return { valid: false, issue: "too-small", message: messages["too-small"] }
  }
  if (file.size > maxBytes) {
    return { valid: false, issue: "too-large", message: messages["too-large"] }
  }
  return { valid: true, contentType: file.type as SupportedImageType }
}

export function readImageDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("The image could not be read. Choose another file."))
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("The image could not be read. Choose another file."))
        return
      }
      resolve(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export function uploadToSignedUrl(
  file: File,
  uploadURL: string,
  options: {
    onProgress?: (percent: number) => void
    errorMessage?: string
  } = {},
): Promise<void> {
  const errorMessage = options.errorMessage ?? "The image could not be stored. Try again."
  if (!options.onProgress) {
    return fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    }).then((response) => {
      if (!response.ok) throw new Error(errorMessage)
    })
  }

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open("PUT", uploadURL)
    request.setRequestHeader("Content-Type", file.type)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    }
    request.onerror = () => reject(new Error(errorMessage))
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve()
      else reject(new Error(errorMessage))
    }
    request.send(file)
  })
}