import * as React from "react"
import { Camera, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { readImageDataUrl, validateImageFile } from "@/lib/image-upload"

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) || "?").toUpperCase()
}

type ProfilePhotoControlProps = {
  userId: string
  name: string
  imageUrl?: string
  size?: "sm" | "lg"
  disabled?: boolean
  onUploaded?: (imageUrl: string) => void
}

export function ProfilePhotoControl({
  userId,
  name,
  imageUrl,
  size = "sm",
  disabled = false,
  onUploaded,
}: ProfilePhotoControlProps) {
  const [currentImageUrl, setCurrentImageUrl] = React.useState(imageUrl || "")
  const [isUploading, setIsUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    setCurrentImageUrl(imageUrl || "")
  }, [imageUrl])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    const validation = validateImageFile(file)
    if (!validation.valid) {
      setError(validation.message)
      return
    }

    setError(null)
    setIsUploading(true)
    try {
      const imageData = await readImageDataUrl(file)
      const response = await fetch(`/api/users/${encodeURIComponent(userId)}/profile-image`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      })
      const payload = await response.json().catch(() => null) as { imageUrl?: string; error?: string } | null
      if (!response.ok || !payload?.imageUrl) {
        throw new Error(payload?.error || "The profile photo could not be updated.")
      }
      setCurrentImageUrl(payload.imageUrl)
      onUploaded?.(payload.imageUrl)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The profile photo could not be updated.")
    } finally {
      setIsUploading(false)
    }
  }

  const sizeClasses = size === "lg"
    ? "h-20 w-20 rounded-2xl text-2xl"
    : "h-12 w-12 rounded-full text-sm"
  const controlSize = size === "lg" ? "h-20 w-20" : "h-12 w-12"

  return (
    <div className={cn("relative shrink-0", controlSize)}>
      <div className="relative">
        {currentImageUrl ? (
          <img
            src={currentImageUrl}
            alt={`${name} profile`}
            className={cn(sizeClasses, "border border-primary/40 object-cover shadow-[0_0_22px_hsl(var(--primary)/0.22)]")}
          />
        ) : (
          <div className={cn(sizeClasses, "flex items-center justify-center bg-primary font-bold text-primary-foreground shadow-[0_0_22px_hsl(var(--primary)/0.22)]")}>
            {initials(name)}
          </div>
        )}
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className={cn(
            "absolute -bottom-2 -right-2 h-8 w-8 rounded-full border border-border shadow-md",
            size === "lg" && "h-9 w-9",
          )}
          aria-label={`Change profile photo for ${name}`}
          onClick={() => inputRef.current?.click()}
          disabled={disabled || isUploading}
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => void handleFileChange(event)}
          disabled={disabled || isUploading}
        />
      </div>
      {error && <p role="alert" className="absolute left-1/2 top-full z-10 mt-2 w-48 -translate-x-1/2 text-center text-xs text-destructive">{error}</p>}
    </div>
  )
}