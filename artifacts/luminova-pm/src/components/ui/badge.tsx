import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-mono font-bold transition-all focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.4)]",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.4)]",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.4)]",
        outline: "text-foreground border-border/50 bg-black/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]",
        success: "border-transparent bg-success text-success-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.4)]",
        warning: "border-transparent bg-warning text-warning-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.4)]",
        info: "border-transparent bg-info text-info-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.4)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
