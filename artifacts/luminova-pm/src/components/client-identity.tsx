import * as React from "react"
import { cn } from "@/lib/utils"

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) || "?").toUpperCase()
}

export function ClientIdentity({
  name,
  logoUrl,
  size = "md",
  className,
}: {
  name: string
  logoUrl?: string | null
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const [imageFailed, setImageFailed] = React.useState(false)
  React.useEffect(() => setImageFailed(false), [logoUrl])
  const sizeClass = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs"

  return (
    <div className={cn("shrink-0 overflow-hidden rounded-lg border border-primary/30 bg-primary/10", sizeClass, className)}>
      {logoUrl && !imageFailed ? (
        <img src={logoUrl} alt={`${name} logo`} className="h-full w-full object-contain bg-background" onError={() => setImageFailed(true)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-heading font-bold text-primary" aria-label={`${name} initials`}>
          {initials(name)}
        </div>
      )}
    </div>
  )
}