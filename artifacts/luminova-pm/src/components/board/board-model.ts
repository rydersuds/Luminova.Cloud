import type { BoardGroupColor, BoardItem, BoardItemPriority, BoardItemStatus } from "@workspace/api-client-react"

export const BOARD_STATUSES: BoardItemStatus[] = ["Not started", "Working on it", "Stuck", "Done"]
export const BOARD_PRIORITIES: BoardItemPriority[] = ["Critical", "High", "Medium", "Low"]
/** Ordered so that neighbours in the list contrast, which keeps new groups and projects easy to tell apart. */
export const GROUP_COLORS: BoardGroupColor[] = ["gold", "sky", "pink", "green", "orange", "indigo", "teal", "red", "lime", "violet", "amber", "blue", "slate"]

/** HSL triplets so callers can add their own alpha: `hsl(${tone} / .2)`. */
export const STATUS_TONE: Record<BoardItemStatus, string> = {
  "Not started": "40 6% 46%",
  "Working on it": "36 95% 52%",
  Stuck: "356 78% 56%",
  Done: "145 58% 40%",
}

export const PRIORITY_TONE: Record<BoardItemPriority, string> = {
  Critical: "356 78% 50%",
  High: "22 90% 54%",
  Medium: "43 90% 52%",
  Low: "210 12% 55%",
}

export const GROUP_TONE: Record<BoardGroupColor, string> = {
  gold: "43 90% 56%",
  amber: "36 95% 50%",
  orange: "22 92% 56%",
  red: "356 75% 58%",
  pink: "330 78% 64%",
  violet: "272 60% 66%",
  indigo: "235 62% 66%",
  blue: "212 82% 58%",
  sky: "195 85% 55%",
  teal: "172 62% 42%",
  green: "145 55% 45%",
  lime: "82 62% 48%",
  slate: "40 6% 58%",
}

/** Text colour that stays readable on each group colour when used as a fill. */
const LIGHT_FILLS = new Set<BoardGroupColor>(["gold", "amber", "orange", "sky", "lime", "pink", "slate"])
export const groupTextColor = (color: BoardGroupColor) => (LIGHT_FILLS.has(color) ? "hsl(36 40% 8%)" : "#fff")

/** Picks a stable colour for a person or company so the same owner always looks the same. */
export function personColor(name: string): BoardGroupColor {
  // FNV-1a spreads similar names across the palette; slate (last) is left out as too quiet for a badge.
  let hash = 2166136261
  for (const char of name.trim().toLowerCase()) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return GROUP_COLORS[(hash >>> 0) % (GROUP_COLORS.length - 1)]
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter((word) => /[a-z0-9]/i.test(word))
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : words[0]?.[1] ?? "")).toUpperCase()
}

export const statusTextColor = (status: BoardItemStatus) => (status === "Working on it" ? "hsl(36 40% 8%)" : "#fff")

// Dates travel as YYYY-MM-DD. Work in UTC days so daylight-saving shifts never move a task.
const DAY = 86_400_000

export function parseDay(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY
}

export function formatDay(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10)
}

export function todayDay(now = new Date()): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY
}

export function dayToDate(day: number): Date {
  return new Date(day * DAY)
}

export function shortDate(day: number) {
  return dayToDate(day).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
}

export function itemSpan(item: Pick<BoardItem, "startDate" | "endDate">): { start: number; end: number } | null {
  const start = parseDay(item.startDate)
  const end = parseDay(item.endDate)
  if (start === null && end === null) return null
  return { start: start ?? end!, end: end ?? start! }
}

export function timelineLabel(item: Pick<BoardItem, "startDate" | "endDate">) {
  const span = itemSpan(item)
  if (!span) return ""
  if (span.start === span.end) return shortDate(span.start)
  return `${shortDate(span.start)} – ${shortDate(span.end)}`
}

export function isOverdue(item: Pick<BoardItem, "status" | "endDate">, today = todayDay()) {
  const end = parseDay(item.endDate)
  return item.status !== "Done" && end !== null && end < today
}

export function formatCents(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return ""
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(cents / 100)
}

/** Parses what someone types into a cost cell ("$12,500", "12500.50") into cents; null clears it. */
export function parseCostInput(value: string): number | null | undefined {
  const cleaned = value.replace(/[$,\s]/g, "")
  if (!cleaned) return null
  const amount = Number(cleaned)
  if (!Number.isFinite(amount) || amount < 0) return undefined
  return Math.round(amount * 100)
}
