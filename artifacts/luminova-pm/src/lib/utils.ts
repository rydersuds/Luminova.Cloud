import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value)
}

export function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dateString))
}

export function formatDateOnly(dateString: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return "Not set"
  const calendarDate = new Date(`${dateString}T00:00:00Z`)
  if (Number.isNaN(calendarDate.valueOf()) || calendarDate.toISOString().slice(0, 10) !== dateString) return "Not set"
  const parsed = new Date(`${dateString}T00:00:00`)
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed)
}

export function getDaysRemaining(dateString: string, asOfDate = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null
  const targetDate = new Date(`${dateString}T00:00:00Z`)
  if (Number.isNaN(targetDate.valueOf()) || targetDate.toISOString().slice(0, 10) !== dateString) return null

  const asOfDateOnly = asOfDate.toISOString().slice(0, 10)
  const currentDate = new Date(`${asOfDateOnly}T00:00:00Z`)
  return Math.round((targetDate.getTime() - currentDate.getTime()) / 86_400_000)
}

export function formatDaysRemaining(dateString: string, asOfDate = new Date()) {
  const daysRemaining = getDaysRemaining(dateString, asOfDate)
  if (daysRemaining === null) return "No end date"
  if (daysRemaining === 0) return "Due today"
  if (daysRemaining === 1) return "1 day remaining"
  if (daysRemaining > 1) return `${daysRemaining} days remaining`
  if (daysRemaining === -1) return "1 day overdue"
  return `${Math.abs(daysRemaining)} days overdue`
}

export function getStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case "active":
    case "approved":
    case "completed":
      return "success"
    case "pending":
    case "in progress":
    case "review":
      return "warning"
    case "delayed":
    case "rejected":
    case "rejected for bid":
    case "overdue":
      return "destructive"
    default:
      return "secondary"
  }
}
