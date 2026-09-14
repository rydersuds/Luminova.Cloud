import { Link, useLocation } from "wouter"
import {
  Building2,
  FolderKanban,
  Users,
  FileText,
  ClipboardList,
  MessageSquare,
  UserCog,
  Menu,
  X,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  UserRound,
  Moon,
  Sun,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { preloadPage } from "@/lib/page-preload"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useClerk, useUser } from "@clerk/react"
import { useTheme } from "@/hooks/use-theme"
import { CookieConsentBanner } from "@/components/cookie-consent-banner"

type IndicatorPhase = "idle" | "travel" | "settle"

const NAV_ITEMS = [
  { href: "/", label: "Command Center", icon: Building2 },
  { href: "/projects", label: "All Projects", icon: FolderKanban },
  { href: "/trades", label: "Trades & Vendors", icon: Users },
  { href: "/quotes", label: "Vendor Quotes", icon: ClipboardList },
  { href: "/invoices", label: "Financials", icon: FileText },
  { href: "/messages", label: "Communications", icon: MessageSquare },
  { href: "/users", label: "Users & Roles", icon: UserCog },
]

type AppLayoutViewProps = {
  children: React.ReactNode
  location: string
  displayName: string
  email: string
  onSignOut: () => void
  initialSidebarOpen?: boolean
  initialSidebarCollapsed?: boolean
  initialProfileOpen?: boolean
  hoveredHref?: string
  onNavigate?: (href: string) => void
  showCookieConsent?: boolean
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = "luminova-sidebar-collapsed"
let previousMountedIndicatorLocation: string | null = null
let previousMountedIndicatorTop = 0

function readSidebarCollapsedPreference() {
  if (typeof window === "undefined") return false

  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

export function AppLayoutView({
  children,
  location,
  displayName,
  email,
  onSignOut,
  initialSidebarOpen = false,
  initialSidebarCollapsed,
  initialProfileOpen = false,
  hoveredHref,
  onNavigate,
  showCookieConsent = true,
}: AppLayoutViewProps) {
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(initialSidebarOpen)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => initialSidebarCollapsed ?? readSidebarCollapsedPreference(),
  )
  const [profileOpen, setProfileOpen] = useState(initialProfileOpen)
  const [isMobile, setIsMobile] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const activeLinkRef = useRef<HTMLAnchorElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const indicatorSheenRef = useRef<HTMLDivElement>(null)
  const indicatorAnimationRef = useRef<Animation | null>(null)
  const indicatorSheenAnimationRef = useRef<Animation | null>(null)
  const indicatorPhaseRef = useRef<IndicatorPhase>("idle")
  const finishTimerRef = useRef<number | null>(null)
  const hasPositionedIndicator = useRef(previousMountedIndicatorLocation !== null)
  const previousIndicatorLocation = useRef(previousMountedIndicatorLocation ?? location)
  const indicatorTopRef = useRef(previousMountedIndicatorTop)
  const [indicator, setIndicator] = useState({
    top: 0,
    height: 0,
    ready: false,
    phase: "idle" as IndicatorPhase,
    lastMotion: "none" as "none" | "staged",
    direction: "none" as "none" | "up" | "down",
  })
  const [visuallyActiveLocation, setVisuallyActiveLocation] = useState(location)
  const initials = displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false)
    window.requestAnimationFrame(() => menuButtonRef.current?.focus())
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)")
    const updateMobileState = () => setIsMobile(mediaQuery.matches)
    updateMobileState()
    mediaQuery.addEventListener("change", updateMobileState)
    return () => mediaQuery.removeEventListener("change", updateMobileState)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed))
    } catch {
      // A blocked storage context should not make the navigation unusable.
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    if (!sidebarOpen || !isMobile) return

    const sidebar = sidebarRef.current
    const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusableElements = () =>
      Array.from(sidebar?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
        .filter((element) => {
          const style = window.getComputedStyle(element)
          return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0
        })

    window.requestAnimationFrame(() => focusableElements()[0]?.focus())

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        closeSidebar()
        return
      }

      if (event.key !== "Tab") return
      const elements = focusableElements()
      if (elements.length === 0) {
        event.preventDefault()
        sidebar?.focus()
        return
      }

      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [closeSidebar, isMobile, sidebarOpen])

  useLayoutEffect(() => {
    const nav = navRef.current
    const activeLink = activeLinkRef.current
    if (!nav || !activeLink) return
    const shouldAnimate = hasPositionedIndicator.current && previousIndicatorLocation.current !== location

    const measureIndicator = () => {
      const navRect = nav.getBoundingClientRect()
      const linkRect = activeLink.getBoundingClientRect()
      const navPaddingTop = Number.parseFloat(window.getComputedStyle(nav).paddingTop)
      return {
        top: linkRect.top - navRect.top + nav.scrollTop - navPaddingTop,
        height: linkRect.height,
      }
    }

    const clearMotion = () => {
      indicatorAnimationRef.current?.cancel()
      indicatorAnimationRef.current = null
      indicatorSheenAnimationRef.current?.cancel()
      indicatorSheenAnimationRef.current = null
      if (finishTimerRef.current !== null) {
        window.clearTimeout(finishTimerRef.current)
        finishTimerRef.current = null
      }
    }

    const target = measureIndicator()
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    clearMotion()

    if (shouldAnimate && !prefersReducedMotion && indicatorRef.current) {
      const startTop = indicatorTopRef.current
      indicatorTopRef.current = target.top
      previousMountedIndicatorTop = target.top
      previousMountedIndicatorLocation = location
      indicatorPhaseRef.current = "travel"
      setIndicator({
        ...target,
        ready: true,
        phase: "travel",
        lastMotion: "none",
        direction: target.top > startTop ? "down" : "up",
      })

      const indicatorElement = indicatorRef.current
      const direction = target.top > startTop ? 1 : -1
      const distance = Math.abs(target.top - startTop)
      const travelDuration = Math.min(520, 360 + distance * 0.18)
      const travelAnimation = indicatorElement.animate(
        [
          {
            transform: `translateY(${startTop}px) scale(1.025)`,
            borderRadius: "12px",
            offset: 0,
          },
          {
            transform: `translateY(${startTop + (target.top - startTop) * 0.58}px) scale(0.99)`,
            borderRadius: "18px",
            offset: 0.56,
          },
          {
            transform: `translateY(${target.top}px) scale(1)`,
            borderRadius: "12px",
            offset: 1,
          },
        ],
        {
          duration: travelDuration,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "both",
        },
      )
      indicatorAnimationRef.current = travelAnimation
      const sheenAnimation = indicatorSheenRef.current?.animate(
        [
          { transform: `translateX(${direction > 0 ? "-145%" : "145%"}) skewX(-12deg)`, opacity: 0 },
          { transform: "translateX(0%) skewX(-12deg)", opacity: 0.62, offset: 0.5 },
          { transform: `translateX(${direction > 0 ? "145%" : "-145%"}) skewX(-12deg)`, opacity: 0 },
        ],
        {
          duration: travelDuration + 60,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "both",
        },
      )
      if (sheenAnimation) indicatorSheenAnimationRef.current = sheenAnimation
      travelAnimation.finished.then(() => {
        if (indicatorAnimationRef.current !== travelAnimation) return
        indicatorPhaseRef.current = "settle"
        setIndicator((current) => ({ ...current, phase: "settle" }))
        setVisuallyActiveLocation(location)

        const settleAnimation = indicatorElement.animate(
          [
            {
              transform: `translateY(${target.top}px) scale(1)`,
            },
            {
              transform: `translateY(${target.top}px) scale(1.025)`,
            },
          ],
          {
            duration: 130,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "both",
          },
        )
        indicatorAnimationRef.current = settleAnimation
        settleAnimation.finished.then(() => {
          if (indicatorAnimationRef.current !== settleAnimation) return
          indicatorAnimationRef.current = null
          finishTimerRef.current = window.setTimeout(() => {
            indicatorPhaseRef.current = "idle"
            finishTimerRef.current = null
            setIndicator((current) => ({ ...current, phase: "idle", lastMotion: "staged" }))
          }, 140)
        }).catch(() => undefined)
      }).catch(() => undefined)
    } else {
      indicatorTopRef.current = target.top
      previousMountedIndicatorTop = target.top
      previousMountedIndicatorLocation = location
      indicatorPhaseRef.current = "idle"
      setIndicator({ ...target, ready: true, phase: "idle", lastMotion: "none", direction: "none" })
      setVisuallyActiveLocation(location)
    }

    const positionAfterLayoutChange = () => {
      if (indicatorPhaseRef.current !== "idle") return
      const measured = measureIndicator()
      indicatorTopRef.current = measured.top
      setIndicator((current) => ({ ...current, ...measured, ready: true, phase: "idle" }))
      hasPositionedIndicator.current = true
    }

    hasPositionedIndicator.current = true
    previousIndicatorLocation.current = location
    const observer = new ResizeObserver(positionAfterLayoutChange)
    observer.observe(nav)
    observer.observe(activeLink)
    window.addEventListener("resize", positionAfterLayoutChange)

    return () => {
      clearMotion()
      observer.disconnect()
      window.removeEventListener("resize", positionAfterLayoutChange)
    }
  }, [location, sidebarCollapsed, sidebarOpen])

  return (
    <div data-testid="app-layout" className="relative isolate min-h-[100dvh] flex flex-col md:flex-row overflow-x-clip bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <div data-testid="app-background" aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-tech-grid">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-primary/20 blur-[120px] opacity-60" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/20 blur-[120px] opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-br from-background/40 via-background/70 to-background/95" />
      </div>
      <div className="md:hidden flex items-center justify-between p-4 glass-panel-dark text-sidebar-foreground z-30 relative border-b border-sidebar-border shadow-md">
        <div className="flex items-center">
          <img src="/luminova-logo.png" alt="Luminova Construction" className="h-10 w-36 object-contain object-left drop-shadow-md" />
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
          aria-controls="mobile-navigation"
          aria-expanded={sidebarOpen}
          onClick={() => sidebarOpen ? closeSidebar() : setSidebarOpen(true)}
          className="p-2 -mr-2 text-primary hover:text-primary/80 transition-colors"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Dismiss navigation"
          data-testid="sidebar-overlay"
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-20 md:hidden transition-opacity"
          onClick={closeSidebar}
        />
      )}

      <aside
        ref={sidebarRef}
        id="mobile-navigation"
        data-sidebar-collapsed={sidebarCollapsed}
        role={isMobile ? "dialog" : undefined}
        aria-modal={isMobile ? true : undefined}
        aria-label={isMobile ? "Main navigation" : undefined}
        aria-hidden={isMobile && !sidebarOpen ? true : undefined}
        tabIndex={isMobile ? -1 : undefined}
        className={cn(
        "sidebar-chrome fixed md:sticky md:top-4 md:self-start inset-y-0 left-0 w-72 glass-panel-dark text-sidebar-foreground flex flex-col z-30 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] md:transition-[width,transform] md:m-4 md:rounded-2xl md:h-[calc(100dvh-2rem)] motion-reduce:transition-none",
        sidebarCollapsed ? "md:w-[4.5rem]" : "md:w-72",
        sidebarOpen ? "translate-x-0 shadow-[0_0_50px_rgba(0,0,0,0.8)]" : "-translate-x-full md:translate-x-0",
      )}>
        <div className={cn(
          "hidden md:flex flex-col relative items-center",
          sidebarCollapsed ? "px-2 pt-12 pb-2" : "px-6 py-8",
        )}>
          <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-primary/20 to-transparent opacity-50" />
          <div className="absolute top-[-20px] left-[-20px] w-[100px] h-[100px] rounded-full bg-primary/30 blur-[40px] opacity-60" />
          {sidebarCollapsed ? (
            <Building2
              aria-label="Luminova Construction"
              data-testid="compact-sidebar-logo"
              className="relative z-10 h-9 w-9 text-primary drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
            />
          ) : (
            <img src="/luminova-logo.png" alt="Luminova Construction" className="h-16 w-auto object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] z-10" />
          )}
          <button
            type="button"
            data-testid="desktop-sidebar-toggle"
            aria-controls="mobile-navigation"
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            className="absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar motion-reduce:transition-none"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <nav
          ref={navRef}
          aria-label="Main navigation"
          className={cn(
            "relative flex-1 py-6 md:py-2 space-y-3 overflow-y-auto",
            sidebarCollapsed ? "px-2" : "px-4",
          )}
        >
          <div
            ref={indicatorRef}
            data-testid="sidebar-selection-indicator"
            data-animate={indicator.phase === "idle" ? "false" : "true"}
            data-motion-phase={indicator.phase}
            data-motion-direction={indicator.direction}
            data-last-motion={indicator.lastMotion}
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute z-0 overflow-hidden rounded-xl border border-white/45 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_2px_4px_rgba(255,255,255,0.48),inset_0_-2px_4px_rgba(75,59,0,0.18),0_0_24px_hsl(var(--primary)/0.56),0_10px_28px_-6px_hsl(var(--primary)/0.85)] will-change-transform",
              sidebarCollapsed ? "left-2 right-2" : "left-4 right-4",
              !indicator.ready && "opacity-0",
            )}
            style={{
              height: indicator.height,
              transform: `translateY(${indicator.top}px) scale(1.025)`,
              backgroundColor: "hsl(var(--primary) / 0.9)",
              backgroundImage: "radial-gradient(circle at 18% 0%, hsl(0 0% 100% / 0.58), transparent 36%), linear-gradient(180deg, hsl(0 0% 100% / 0.24) 0%, transparent 42%, hsl(0 0% 0% / 0.12) 100%)",
            }}
          >
            <div
              ref={indicatorSheenRef}
              className="absolute inset-y-[-12%] left-[-42%] w-[84%] rounded-[50%] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.56),transparent)] blur-[1px] opacity-0"
            />
            <div className="absolute inset-x-3 top-[2px] h-px rounded-full bg-white/70 opacity-90" />
            <div className="absolute inset-x-5 bottom-[3px] h-px rounded-full bg-white/25" />
          </div>
          <div
            data-contrast-label="navigation section label"
            className={cn(
              "relative z-10 text-[10px] font-mono uppercase tracking-widest text-sidebar-foreground/60 mb-4 px-2",
              sidebarCollapsed && "sr-only",
            )}
          >
            Operations Center
          </div>
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            const isVisuallyActive = visuallyActiveLocation === item.href || (item.href !== "/" && visuallyActiveLocation.startsWith(item.href))
            const isForcedHover = hoveredHref === item.href && !isActive
            return (
              <Link
                key={item.href}
                href={item.href}
                ref={isActive ? activeLinkRef : undefined}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
                title={sidebarCollapsed ? item.label : undefined}
                data-contrast-label={`navigation link "${item.label}"`}
                className={cn(
                  "group relative z-10 flex items-center py-3.5 rounded-xl text-sm font-bold transition-[color,background-color,box-shadow,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden shadow-sm motion-reduce:transition-none",
                  sidebarCollapsed ? "justify-center gap-0 px-2" : "gap-3 px-4",
                  isVisuallyActive
                    ? "text-primary-foreground transform scale-[1.025]"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_2px_10px_rgba(0,0,0,0.2)]",
                  isForcedHover && "bg-sidebar-accent text-sidebar-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_2px_10px_rgba(0,0,0,0.2)]",
                )}
                onClick={(event) => {
                  if (onNavigate) {
                    event.preventDefault()
                    onNavigate(item.href)
                    return
                  }
                  closeSidebar()
                }}
                 onMouseEnter={() => preloadPage(item.href)}
                 onFocus={() => preloadPage(item.href)}
                 onTouchStart={() => preloadPage(item.href)}
              >
                <item.icon
                  size={20}
                  className={cn(
                    "relative z-10 transition-[transform,color,filter] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] drop-shadow-md motion-reduce:transition-none",
                    isVisuallyActive ? "scale-[1.18] -rotate-3 drop-shadow-[0_2px_5px_rgba(0,0,0,0.35)]" : "group-hover:scale-110 group-hover:text-primary",
                    isForcedHover && "scale-110 text-primary",
                  )}
                />
                <span
                  className={cn(
                    "relative z-10 tracking-wide drop-shadow-sm transition-[transform,letter-spacing] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                    sidebarCollapsed && "sr-only",
                    isVisuallyActive && "translate-x-1 tracking-[0.035em]",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>

        <div className={cn("mt-auto", sidebarCollapsed ? "p-2" : "p-4")}>
          <div className="relative">
            <button
              type="button"
              data-contrast-label="profile control"
              onClick={() => setProfileOpen((open) => !open)}
              aria-label={`Account menu for ${displayName}`}
              title={sidebarCollapsed ? `Account menu for ${displayName}` : undefined}
              aria-expanded={profileOpen}
              className={cn(
                "flex w-full cursor-pointer items-center rounded-xl py-3 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar motion-reduce:transition-none",
                sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3",
              )}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center font-heading font-bold text-primary-foreground shadow-[inset_0_1px_3px_rgba(255,255,255,0.5),0_4px_12px_hsl(var(--primary)/0.4)]">
                {initials || "PM"}
              </div>
              <div className={cn("min-w-0 flex-1", sidebarCollapsed && "sr-only")}>
                <p className="font-bold truncate tracking-wide drop-shadow-sm">{displayName}</p>
                <p
                  data-contrast-label="profile email"
                  className="truncate text-[13px] font-medium leading-5 text-white/75"
                  title={email}
                >
                  {email}
                </p>
              </div>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-primary transition-transform drop-shadow-sm", sidebarCollapsed && "hidden", profileOpen && "rotate-180")} />
            </button>
            {profileOpen && (
              <div
                className={cn(
                  "mt-2 space-y-2",
                  sidebarCollapsed && "md:absolute md:left-[calc(100%+0.5rem)] md:bottom-0 md:z-50 md:mt-0 md:w-44 md:rounded-xl md:bg-[#202020] md:p-2 md:shadow-xl",
                )}
              >
                <Link
                  href="/profile"
                  data-contrast-label="profile page link"
                  onClick={() => {
                    setProfileOpen(false)
                    closeSidebar()
                  }}
                  onMouseEnter={() => preloadPage("/profile")}
                  onFocus={() => preloadPage("/profile")}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-3 text-xs font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
                >
                  <UserRound className="h-4 w-4" />
                  Profile
                </Link>
                <button
                  type="button"
                  data-contrast-label="sign-out control"
                  onClick={onSignOut}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-3 text-xs font-bold uppercase tracking-wider text-red-400 transition-all hover:bg-destructive hover:text-destructive-foreground hover:shadow-[0_4px_10px_rgba(255,0,0,0.3)] motion-reduce:transition-none"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
            <button
              type="button"
              data-testid="theme-toggle"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={theme === "dark"}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={toggleTheme}
              className={cn(
                "mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-bold uppercase tracking-wider text-sidebar-foreground transition-colors hover:bg-sidebar-accent/80 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar motion-reduce:transition-none",
                sidebarCollapsed && "md:px-2",
              )}
            >
              {theme === "dark" ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
              <span className={cn(sidebarCollapsed && "sr-only")}>
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </span>
            </button>
          </div>
        </div>
      </aside>

      <main className="relative z-10 flex-1 flex min-w-0 max-w-full flex-col overflow-x-hidden md:overflow-hidden">
        <div className="relative z-10 flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden md:h-full md:overflow-hidden">
          {children}
        </div>
      </main>
      {showCookieConsent && <CookieConsentBanner />}
    </div>
  )
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const { signOut } = useClerk()
  const { user } = useUser()

  return (
    <AppLayoutView
      location={location}
      displayName={user?.fullName || user?.firstName || "Project Manager"}
      email={user?.primaryEmailAddress?.emailAddress || "Signed in"}
      onSignOut={() => void signOut({ redirectUrl: import.meta.env.BASE_URL })}
    >
      {children}
    </AppLayoutView>
  )
}
