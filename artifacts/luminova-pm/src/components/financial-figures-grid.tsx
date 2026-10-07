import * as React from "react"
import { cn } from "@/lib/utils"

/** Choose columns from the rendered amounts, not a fixed screen breakpoint. */
export function FinancialFiguresGrid({
  children,
  amountAllowance,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"section"> & { amountAllowance: number }) {
  const ref = React.useRef<HTMLElement>(null)
  const [columns, setColumns] = React.useState(1)

  React.useLayoutEffect(() => {
    const grid = ref.current
    if (!grid) return
    let frame = 0
    let disposed = false
    const amounts = Array.from(grid.querySelectorAll<HTMLElement>("[data-financial-amount]"))
    const measure = () => {
      if (disposed) return
      const minimum = Math.max(amountAllowance, ...amounts.map(amount =>
        Math.ceil(amount.getBoundingClientRect().width) + amountAllowance,
      ))
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
      setColumns(grid.clientWidth >= minimum * 2 + gap ? 2 : 1)
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    measure()
    const observer = new ResizeObserver(schedule)
    observer.observe(grid)
    amounts.forEach(amount => observer.observe(amount))
    document.fonts.ready.then(schedule)
    document.fonts.addEventListener("loadingdone", schedule)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.fonts.removeEventListener("loadingdone", schedule)
    }
  }, [children, amountAllowance])

  return (
    <section
      {...props}
      ref={ref}
      className={cn("grid", className)}
      style={{ ...props.style, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </section>
  )
}
