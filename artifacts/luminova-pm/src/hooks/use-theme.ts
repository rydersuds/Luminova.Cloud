import { useEffect, useState } from "react"

export type Theme = "light" | "dark"

const THEME_STORAGE_KEY = "luminova-theme"

function readTheme(): Theme {
  if (typeof window === "undefined") return "light"

  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light"
  } catch {
    return "light"
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