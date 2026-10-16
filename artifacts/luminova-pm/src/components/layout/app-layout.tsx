import { Link, useLocation } from "wouter"
import {
  Building2,
  FolderKanban,
  Users,
  FileText,
  ClipboardList,
  UserCog,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  UserRound,
  Moon,
  Sun,
  CalendarRange,
  BadgeCheck,
  Smartphone,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { preloadPage } from "@/lib/page-preload"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useClerk, useUser } from "@clerk/react"
import { getGetPurchaseApprovalsQueryKey, useGetCurrentWorkspaceUser, useGetPurchaseApprovals } from "@workspace/api-client-react"
import { useTheme } from "@/hooks/use-theme"
import { CookieConsentBanner } from "@/components/cookie-consent-banner"

type IndicatorPhase = "idle" | "travel" | "settle"

type NavItem = { href: string; label: string; icon: typeof Building2; hint: string; adminOnly?: boolean; managersOnly?: boolean; mobileOnly?: boolean }
// Overview pages first, then the supporting tools. Project boards open from All Projects.
const WORKSPACE_GROUP = {
  label: "Workspace",
  items: [
    { href: "/", label: "Command Center", icon: Building2, hint: "Today across all sites" },
    { href: "/mobile", label: "Quick View", icon: Smartphone, hint: "Important work at a glance", mobileOnly: true },
    { href: "/projects", label: "All Projects", icon: FolderKanban, hint: "Every job site and its progress" },
    { href: "/schedule", label: "Schedule", icon: CalendarRange, hint: "Timeline and calendar across projects" },
    { href: "/approvals", label: "Approvals", icon: BadgeCheck, hint: "Budget checks and over-budget approvals", managersOnly: true },
  ] as NavItem[],
}
const SUPPORT_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Purchasing",
    items: [
      { href: "/trades", label: "Trades & Vendors", icon: Users, hint: "Vendors and trade budgets" },
      { href: "/quotes", label: "Vendor Quotes", icon: ClipboardList, hint: "Compare and award" },
      { href: "/invoices", label: "Financials", icon: FileText, hint: "Vendor invoices" },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/users", label: "Users & Roles", icon: UserCog, hint: "Access and invitations", adminOnly: true },
    ],
  },
]
const NAV_GROUPS = [WORKSPACE_GROUP, ...SUPPORT_GROUPS]

const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

export function getBreadcrumbs(location: string): { label: string; href?: string }[] {
  if (location === "/") return []
  const parts = location.split("/").filter(Boolean)
  const section = NAV_ITEMS.find((i) => i.href === `/${parts[0]}`)
  const label = section?.label ?? (parts[0] === "profile" ? "Profile" : null)
  if (!label) return []
  const crumbs: { label: string; href?: string }[] = [{ label: "Command Center", href: "/" }]
  if (parts.length > 1 && section) {
    crumbs.push({ label: parts[0] === "projects" ? "Projects" : label, href: section.href })
    crumbs.push({ label: parts[0] === "projects" ? "Project details" : parts[0] === "trades" ? "Vendor details" : "Details" })
  } else crumbs.push({ label })
  return crumbs
}

type AppLayoutViewProps = {
  children: React.ReactNode
  location: string
  displayName: string
  email: string
  profileImageUrl?: string | null
  onSignOut: () => void
  initialSidebarOpen?: boolean
  initialSidebarCollapsed?: boolean
  initialProfileOpen?: boolean
  hoveredHref?: string
  onNavigate?: (href: string) => void
  showCookieConsent?: boolean
  role?: string | null
  /** Over-budget requests waiting for a decision, shown as a badge on Approvals. */
  approvalsWaiting?: number
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

function SidebarAvatar({ imageUrl, initials }: { imageUrl?: string | null; initials: string }) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(imageUrl) && !imageFailed

  return (
    <div
      data-testid="sidebar-profile-avatar"
      className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/80 to-primary font-heading font-bold text-primary-foreground shadow-[inset_0_1px_3px_rgba(255,255,255,0.5),0_4px_12px_hsl(var(--primary)/0.4)]"
    >
      {showImage ? (
        <img
          data-testid="sidebar-profile-image"
          src={imageUrl ?? undefined}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span data-testid="sidebar-profile-initials">{initials || "PM"}</span>
      )}
    </div>
  )
}
export function AppLayoutView({
  children,
  location,
  displayName,
  email,
  profileImageUrl,
  onSignOut,
  initialSidebarOpen = false,
  initialSidebarCollapsed,
  initialProfileOpen = false,
  hoveredHref,
  onNavigate,
  showCookieConsent = true,
  role = "Admin",
  approvalsWaiting = 0,
}: AppLayoutViewProps) {
  const isAdmin = role === "Admin"
  const isManager = isAdmin || role === "Project Manager"
  const visibleItem = (item: NavItem) => (!item.adminOnly || isAdmin) && (!item.managersOnly || isManager) && (!item.mobileOnly || isMobile)
  const matchesNav = (item: NavItem, path: string) =>
    path === item.href || (item.href !== "/" && path.startsWith(`${item.href}/`))
  const crumbs = getBreadcrumbs(location)
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(initialSidebarOpen)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => initialSidebarCollapsed ?? readSidebarCollapsedPreference(),
  )
  const [profileOpen, setProfileOpen] = useState(initialProfileOpen)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const activeLinkRef = useRef<HTMLAnchorElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const indicatorSheenRef = useRef<HTMLDivElement>(null)
  const indicatorAnimationRef = useRef<Animation | null>(null)
  const indicatorSheenAnimationRef = useRef<Animation | null>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!sidebarOpen || !isMobile) return
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [sidebarOpen, isMobile])

  const lastSidebarLocation = useRef(location)
  useEffect(() => {
    if (lastSidebarLocation.current !== location) {
      setSidebarOpen(false)
      lastSidebarLocation.current = location
    }
  }, [location])

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
    if (!nav || !activeLink) {
      setIndicator(current => ({ ...current, ready: false }))
      return
    }
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
      // Switch the label colours immediately so the item doesn't fade from light to dark under the marker.
      setVisuallyActiveLocation(location)

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
  }, [location, sidebarCollapsed, sidebarOpen, role])

  return (
    <div
      data-testid="app-layout"
      className="relative isolate min-h-[100dvh] flex flex-col md:flex-row overflow-x-clip bg-background text-foreground selection:bg-primary selection:text-primary-foreground"
      onPointerMove={(event) => {
        const cursor = cursorRef.current
        if (!cursor || event.pointerType === "touch") return
        cursor.style.setProperty("--cursor-x", `${event.clientX}px`)
        cursor.style.setProperty("--cursor-y", `${event.clientY}px`)
        cursor.dataset.visible = "true"

        const target = event.target as Element
        const isText = target.closest(
          "input:not([type='button']):not([type='submit']):not([type='reset']):not([type='radio']):not([type='checkbox']):not([type='file']), textarea, [contenteditable='true']",
        )
        const isInteractive = target.closest(
          "a, button, select, [role='button'], [tabindex]:not([tabindex='-1']), input[type='button'], input[type='submit'], input[type='reset'], input[type='radio'], input[type='checkbox'], input[type='file']",
        )

        cursor.dataset.mode = isText ? "text" : (isInteractive ? "interactive" : "default")
      }}
      onPointerLeave={() => {
        if (cursorRef.current) {
          cursorRef.current.dataset.visible = "false"
          cursorRef.current.dataset.down = "false"
        }
      }}
      onPointerDown={(event) => {
        if (cursorRef.current && event.pointerType !== "touch") {
          cursorRef.current.dataset.down = "true"
        }
      }}
      onPointerUp={(event) => {
        if (cursorRef.current && event.pointerType !== "touch") {
          cursorRef.current.dataset.down = "false"
        }
      }}
      onPointerCancel={(event) => {
        if (cursorRef.current && event.pointerType !== "touch") {
          cursorRef.current.dataset.down = "false"
        }
      }}
    >
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg focus:not-sr-only focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Skip to main content
      </a>
      <div data-testid="app-background" aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-tech-grid workspace-field">
        <div className="absolute top-[-20%] left-[-10%] h-[60%] w-[60%] rounded-full bg-[radial-gradient(circle,hsl(var(--accent)/0.12),transparent_68%)] opacity-45" />
        <div className="absolute bottom-[-20%] right-[-10%] h-[50%] w-[50%] rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.08),transparent_68%)] opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-br from-background/40 via-background/80 to-background/95" />
        <div className="holo-aurora" />
        <div className="holo-floor" />
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
           className="fixed inset-0 z-20 bg-sidebar/80 backdrop-blur-sm transition-opacity md:hidden"
          onClick={closeSidebar}
        />
      )}

      <aside
        ref={sidebarRef}
        id="mobile-navigation"
        data-sidebar-collapsed={sidebarCollapsed}
        role={isMobile && sidebarOpen ? "dialog" : undefined}
        aria-modal={isMobile && sidebarOpen ? true : undefined}
        aria-hidden={isMobile && !sidebarOpen ? true : undefined}
        inert={isMobile && !sidebarOpen}
        aria-label={isMobile ? "Main navigation" : undefined}
        tabIndex={isMobile ? -1 : undefined}
        className={cn(
        "sidebar-chrome sidebar-instrument fixed md:sticky md:top-4 md:self-start inset-y-0 left-0 w-72 glass-panel-dark text-sidebar-foreground flex flex-col z-30 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] md:transition-[width,transform] md:m-4 md:rounded-2xl md:h-[calc(100dvh-2rem)] motion-reduce:transition-none",
        sidebarCollapsed ? "md:w-[4.5rem]" : "md:w-72",
        sidebarOpen ? "translate-x-0 shadow-[0_0_50px_rgba(0,0,0,0.8)]" : "-translate-x-full md:translate-x-0",
      )}>
        <div className={cn(
          "hidden md:flex flex-col relative items-center",
          sidebarCollapsed ? "px-2 pt-12 pb-2" : "px-6 py-8",
        )}>
          <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-primary/20 to-transparent opacity-50" />
          <div className="absolute left-[-20px] top-[-20px] h-[100px] w-[100px] rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.18),transparent_70%)] opacity-50" />
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
               "sidebar-selection-indicator pointer-events-none absolute z-0 overflow-hidden rounded-lg border border-primary/60 shadow-[inset_0_1px_0_hsl(0_0%_100%/.38),0_8px_18px_-10px_hsl(var(--primary)/.55)] will-change-transform",
              sidebarCollapsed ? "left-2 right-2" : "left-4 right-4",
              !indicator.ready && "opacity-0",
            )}
            style={{
              height: indicator.height,
              transform: `translateY(${indicator.top}px) scale(1.025)`,
              backgroundColor: "hsl(var(--primary) / 0.9)",
              backgroundImage: "radial-gradient(ellipse 58px 14px at var(--indicator-light-x, 34%) var(--indicator-light-y, 18%), var(--indicator-light-color, transparent), transparent 100%), linear-gradient(128deg, hsl(0 0% 100% / 0.22) 0%, transparent 34%, hsl(var(--primary) / 0.14) 72%, hsl(0 0% 0% / 0.14) 100%)",
            }}
          >
            <div
              ref={indicatorSheenRef}
              className="absolute inset-y-[-12%] left-[-42%] w-[84%] rounded-[50%] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.56),transparent)] opacity-0"
            />
            <div className="absolute inset-x-3 top-[2px] h-px rounded-full bg-white/70 opacity-90" />
            <div className="absolute inset-x-5 bottom-[3px] h-px rounded-full bg-white/25" />
          </div>
          {NAV_GROUPS.filter((g) => g.items.some(visibleItem)).map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="space-y-1.5">
              <div
                data-contrast-label="navigation section label"
                className={cn(
                  "relative z-10 mb-2 mt-3 flex items-center gap-2 px-2 text-[10px] font-mono uppercase tracking-[0.24em] text-sidebar-foreground/70 before:h-px before:w-4 before:bg-[hsl(var(--signal))]",
                  sidebarCollapsed && "sr-only",
                )}
              >
                {group.label}
              </div>
          {group.items.filter(visibleItem).map((item) => {
            const isActive = matchesNav(item, location)
            const isVisuallyActive = matchesNav(item, visuallyActiveLocation)
            const isForcedHover = hoveredHref === item.href && !isActive
            return (
              <Link
                key={item.href}
                href={item.href}
                ref={isActive ? activeLinkRef : undefined}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label}
                title={sidebarCollapsed ? item.label : item.hint}
                data-contrast-label={`navigation link "${item.label}"`}
                className={cn(
                   "group relative z-10 flex items-center py-3 rounded-lg text-sm font-bold transition-[color,background-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden shadow-sm motion-reduce:transition-none",
                  sidebarCollapsed ? "justify-center gap-0 px-2" : "gap-3 px-4",
                  isVisuallyActive
                    ? "text-primary-foreground transform scale-[1.025]"
                    : "text-sidebar-foreground/70 hover:bg-primary/10 hover:text-sidebar-foreground",
                  isForcedHover && "bg-primary/10 text-sidebar-foreground",
                )}
                onClick={(event) => {
                  if (onNavigate) {
                    event.preventDefault()
                    onNavigate(item.href)
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
                {item.href === "/approvals" && approvalsWaiting > 0 && (
                  <span className={cn("nav-badge", sidebarCollapsed && "nav-badge-dot")} aria-label={`${approvalsWaiting} waiting`}>
                    {sidebarCollapsed ? "" : approvalsWaiting}
                  </span>
                )}
              </Link>
            )
          })}
            </div>
          ))}
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
              <SidebarAvatar
                key={profileImageUrl ?? "no-profile-image"}
                imageUrl={profileImageUrl}
                initials={initials}
              />
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
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-3 text-xs font-bold uppercase tracking-wider text-red-400 transition-all hover:bg-red-700 hover:text-destructive-foreground hover:shadow-[0_4px_10px_rgba(255,0,0,0.3)] motion-reduce:transition-none"
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

      <main id="main-content" tabIndex={-1} inert={isMobile && sidebarOpen} aria-hidden={isMobile && sidebarOpen ? true : undefined} className="workspace-main relative z-10 flex-1 flex min-w-0 max-w-full flex-col overflow-x-hidden outline-none md:overflow-hidden">
        <div className="relative z-10 flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden md:h-full md:overflow-hidden">
          {crumbs.length > 0 && (
            <nav aria-label="Breadcrumb" data-testid="breadcrumb" className="shrink-0 px-4 pt-3 md:px-8">
              <ol className="flex flex-wrap items-center gap-1.5 text-xs text-foreground/70">
                {crumbs.map((c, i) => (
                  <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
                    {c.href ? (
                      <Link href={c.href} className="rounded font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{c.label}</Link>
                    ) : (
                      <span aria-current="page" className="font-bold text-foreground">{c.label}</span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {children}
        </div>
      </main>
      {showCookieConsent && <CookieConsentBanner />}
      <div
        ref={cursorRef}
        data-testid="custom-cursor"
        data-visible="false"
        data-mode="default"
        data-down="false"
        aria-hidden="true"
        className="precision-cursor"
      />
    </div>
  )
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const { signOut } = useClerk()
  const { user } = useUser()
  const { data: workspaceUser } = useGetCurrentWorkspaceUser()
  const managesProjects = workspaceUser?.role === "Admin" || workspaceUser?.role === "Project Manager"
  const { data: approvals } = useGetPurchaseApprovals({
    query: { enabled: managesProjects, queryKey: getGetPurchaseApprovalsQueryKey(), refetchInterval: 60_000 },
  })
  const approvalsWaiting = Array.isArray(approvals)
    ? approvals.filter((approval) => approval.status === "Pending approval").length
    : 0

  return (
    <AppLayoutView
      role={workspaceUser?.role ?? null}
      approvalsWaiting={approvalsWaiting}
      location={location}
      displayName={user?.fullName || user?.firstName || "Project Manager"}
      email={user?.primaryEmailAddress?.emailAddress || "Signed in"}
      profileImageUrl={user?.imageUrl}
      onSignOut={() => void signOut({ redirectUrl: import.meta.env.BASE_URL })}
    >
      {children}
    </AppLayoutView>
  )
}
