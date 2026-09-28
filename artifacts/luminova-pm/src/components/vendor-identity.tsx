import * as React from "react"
import { cn } from "@/lib/utils"

export function VendorIdentity({
  vendorId,
  name,
  initials,
  accent,
  logoUrl,
  positionX = 50,
  positionY = 50,
  zoom = 1,
  className,
}: {
  vendorId: string
  name: string
  initials: string
  accent: string
  logoUrl?: string | null
  positionX?: number
  positionY?: number
  zoom?: number
  className?: string
}) {
  const [imageFailed, setImageFailed] = React.useState(false)

  React.useEffect(() => {
    setImageFailed(false)
  }, [vendorId, logoUrl])

  return (
    <div
      className={cn("shrink-0 overflow-hidden rounded-xl flex items-center justify-center font-heading font-bold shadow-inner", className)}
      style={{
        backgroundColor: `${accent}15`,
        color: accent,
        border: `1px solid ${accent}30`,
      }}
    >
      {logoUrl && !imageFailed ? (
        <img
          src={logoUrl}
          alt={`${name} profile logo`}
          className="h-full w-full object-contain bg-background p-1"
          style={{
            objectPosition: `${positionX}% ${positionY}%`,
            transform: `scale(${zoom})`,
            transformOrigin: `${positionX}% ${positionY}%`,
          }}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-label={`${name} initials`}>{initials}</span>
      )}
    </div>
  )
}