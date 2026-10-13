import { useEffect, useState } from "react"

export type Theme = "light" | "dark"

// v2: the old key stored "light" for everyone, which would hide the new dark default.
const THEME_STORAGE_KEY = "luminova-theme-v2"

function readTheme(): Theme {
  // Dark is the default look; light mode stays one tap away for bright sites.
  if (typeof window === "undefined") return "dark"

  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark"
  } catch {
    return "dark"
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Private browsing and restricted storage should not block theme changes.
    }
  }, [theme])

  return {
    theme,
    toggleTheme: () => setTheme((current) => current === "dark" ? "light" : "dark"),
  }
}