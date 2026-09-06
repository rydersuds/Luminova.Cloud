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
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateString}T00:00:00`))
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
