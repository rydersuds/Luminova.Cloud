import { useMemo } from "react"
import { cn } from "@/lib/utils"

type Props = {
  /** Stable seed (the project id) so each project keeps the same massing. */
  seed: string
  /** 0–100; floors up to this share are drawn as built, the rest as planned. */
  progress: number
  className?: string
}

const COS = Math.cos(Math.PI / 6)
const SIN = Math.sin(Math.PI / 6)

function hash(value: string) {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Isometric wireframe massing used when a project has no exterior photo.
 * Built floors read as solid brass; planned floors are dashed signal lines.
 */
export function WireframeBuilding({ seed, progress, className }: Props) {
  const model = useMemo(() => {
    const h = hash(seed)
    const width = 44 + (h % 4) * 8
    const depth = 36 + ((h >>> 3) % 3) * 8
    const floors = 8 + ((h >>> 6) % 7)
    const floorHeight = 12
    const setback = (h >>> 9) % 2 === 0 ? Math.floor(floors * 0.65) : floors
    const clamped = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0))
    const built = Math.round((floors * clamped) / 100)

    const project = (x: number, y: number, z: number) => [(x - y) * COS, (x + y) * SIN - z] as const
    const pt = (x: number, y: number, z: number) => project(x, y, z).map((n) => n.toFixed(1)).join(",")

    const levels = Array.from({ length: floors + 1 }, (_, level) => {
      const inset = level > setback ? 8 : 0
      const z = level * floorHeight
      const x0 = inset, y0 = inset, x1 = width - inset, y1 = depth - inset
      return {
        level,
        built: level <= built,
        outline: [pt(x0, y0, z), pt(x1, y0, z), pt(x1, y1, z), pt(x0, y1, z)].join(" "),
        corners: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as const,
        z,
        inset,
      }
    })

    const columns = levels.slice(0, -1).flatMap((lv, i) => {
      const next = levels[i + 1]
      const sameInset = next.inset === lv.inset
      return lv.corners.map(([x, y], c) => {
        const [nx, ny] = next.corners[c]
        return {
          key: `${i}-${c}`,
          built: next.built,
          hidden: c === 0,
          d: `M${pt(x, y, lv.z)} L${pt(sameInset ? x : nx, sameInset ? y : ny, next.z)}`,
        }
      })
    })

    const top = project(width, depth, 0)
    const left = project(0, depth, 0)
    const right = project(width, 0, 0)
    const peak = project(0, 0, floors * floorHeight)
    const pad = 18
    const minX = Math.min(left[0], peak[0]) - pad
    const maxX = Math.max(right[0], top[0]) + pad
    const minY = peak[1] - pad - 20
    const maxY = top[1] + pad
    const craneLevel = levels[Math.min(built, floors)]
    const crane = clamped < 100
      ? {
          mast: `M${pt(width * 0.7, depth * 0.3, craneLevel.z)} L${pt(width * 0.7, depth * 0.3, craneLevel.z + 34)}`,
          jib: `M${pt(width * 0.7 - 30, depth * 0.3, craneLevel.z + 34)} L${pt(width * 0.7 + 34, depth * 0.3, craneLevel.z + 34)}`,
          line: `M${pt(width * 0.7 + 24, depth * 0.3, craneLevel.z + 34)} L${pt(width * 0.7 + 24, depth * 0.3, craneLevel.z + 14)}`,
        }
      : null

    return { levels, columns, crane, topBuilt: built, viewBox: `${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}` }
  }, [seed, progress])

  return (
    <svg viewBox={model.viewBox} className={cn("wireframe-building", className)} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <g className="wf-ground">
        {model.levels[0] && <polygon points={model.levels[0].outline} />}
      </g>
      {model.levels.map((lv) => (
        <g key={lv.level} className={lv.built ? (lv.level === model.topBuilt ? "wf-built wf-top" : "wf-built") : "wf-planned"} style={{ animationDelay: `${lv.level * 70}ms` }}>
          <polygon className="wf-slab" points={lv.outline} />
        </g>
      ))}
      {model.columns.filter((c) => !c.hidden).map((c) => (
        <path key={c.key} d={c.d} className={c.built ? "wf-col wf-col-built" : "wf-col wf-col-planned"} />
      ))}
      {model.crane && (
        <g className="wf-crane">
          <path d={model.crane.mast} />
          <path d={model.crane.jib} />
          <path d={model.crane.line} className="wf-crane-line" />
        </g>
      )}
    </svg>
  )
}
