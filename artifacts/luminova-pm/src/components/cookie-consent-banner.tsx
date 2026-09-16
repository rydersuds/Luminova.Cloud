import { useState } from "react"
import { Link } from "wouter"

const COOKIE_CONSENT_STORAGE_KEY = "luminova-cookie-consent-v1"

function hasCookieConsent() {
  if (typeof window === "undefined") return true

  try {
    return window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY) === "accepted"
  } catch {
    return false
  }
}

export function CookieConsentBanner() {
  const [isVisible, setIsVisible] = useState(() => !hasCookieConsent())

  if (!isVisible) return null

  const acceptCookies = () => {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted")
    } catch {
      // Consent still applies for the current page when browser storage is blocked.
    }
    setIsVisible(false)
  }

  return (
    <aside
      aria-label="Cookie consent"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl sm:inset-x-6 sm:flex sm:items-center sm:gap-5"
    >
      <p className="flex-1 text-sm leading-6 text-muted-foreground">
        We use essential cookies and browser storage to keep you signed in and remember your preferences. See our{" "}
        <Link href="/privacy" className="font-semibold text-primary underline underline-offset-4 hover:text-primary/80">
          Privacy Policy
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={acceptCookies}
        className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card sm:mt-0 sm:w-auto"
      >
        Accept
      </button>
    </aside>
  )
}