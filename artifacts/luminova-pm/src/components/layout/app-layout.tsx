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
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useCallback, useEffect, useRef, useState } from "react"
import { useClerk, useUser } from "@clerk/react"

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
  initialProfileOpen?: boolean
  hoveredHref?: string
}

export function AppLayoutView({
  children,
  location,
  displayName,
  email,
  onSignOut,
  initialSidebarOpen = false,
  initialProfileOpen = false,
  hoveredHref,
}: AppLayoutViewProps) {
  const [sidebarOpen, setSidebarOpen] = useState(initialSidebarOpen)
  const [profileOpen, setProfileOpen] = useState(initialProfileOpen)
  const [isMobile, setIsMobile] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
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
    if (!sidebarOpen || !isMobile) return

    const sidebar = sidebarRef.current
    const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusableElements = () =>
      Array.from(sidebar?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])

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

  return (
    <div data-testid="app-layout" className="min-h-[100dvh] flex flex-col md:flex-row bg-background bg-tech-grid text-foreground selection:bg-primary selection:text-primary-foreground">
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
        role={isMobile ? "dialog" : undefined}
        aria-modal={isMobile ? true : undefined}
        aria-label={isMobile ? "Main navigation" : undefined}
        aria-hidden={isMobile && !sidebarOpen ? true : undefined}
        tabIndex={isMobile ? -1 : undefined}
        className={cn(
        "fixed md:static inset-y-0 left-0 w-72 glass-panel-dark text-sidebar-foreground flex flex-col z-30 transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] md:m-4 md:rounded-2xl md:h-[calc(100dvh-2rem)]",
        sidebarOpen ? "translate-x-0 shadow-[0_0_50px_rgba(0,0,0,0.8)]" : "-translate-x-full md:translate-x-0",
      )}>
        <div className="px-6 py-8 hidden md:flex flex-col relative items-center">
          <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-primary/10 to-transparent opacity-50" />
          <img src="/luminova-logo.png" alt="Luminova Construction" className="h-16 w-auto object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] z-10" />
        </div>

        <nav className="flex-1 px-4 py-6 md:py-2 space-y-3 overflow-y-auto">
          <div className="text-[10px] font-mono uppercase tracking-widest text-sidebar-foreground/40 mb-4 px-2">Operations Center</div>
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            const isForcedHover = hoveredHref === item.href && !isActive
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 overflow-hidden shadow-sm",
                  isActive
                    ? "text-primary-foreground bg-primary shadow-[inset_0_1px_2px_rgba(255,255,255,0.3),0_4px_15px_-3px_hsl(var(--primary)/0.5)] transform scale-[1.02]"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_2px_10px_rgba(0,0,0,0.2)]",
                  isForcedHover && "bg-sidebar-accent text-sidebar-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_2px_10px_rgba(0,0,0,0.2)]",
                )}
                onClick={closeSidebar}
              >
                <item.icon size={20} className={cn("transition-transform duration-300 drop-shadow-md", isActive ? "scale-110" : "group-hover:scale-110 group-hover:text-primary", isForcedHover && "scale-110 text-primary")} />
                <span className="relative z-10 tracking-wide drop-shadow-sm">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 mt-auto">
          <div className="surface-3d bg-black/40 backdrop-blur-md p-2 rounded-2xl">
            <button
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              aria-expanded={profileOpen}
              className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm text-sidebar-foreground hover:text-white transition-colors cursor-pointer rounded-xl bg-sidebar-accent/50 hover:bg-sidebar-accent shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
            >
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center font-heading font-bold text-primary-foreground shadow-[inset_0_1px_2px_rgba(255,255,255,0.3),0_4px_8px_rgba(0,0,0,0.5)]">
                {initials || "PM"}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="font-bold truncate tracking-wide drop-shadow-sm">{displayName}</p>
                <p className="text-xs font-mono opacity-60 truncate">{email}</p>
              </div>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-primary transition-transform drop-shadow-sm", profileOpen && "rotate-180")} />
            </button>
            {profileOpen && (
              <button
                type="button"
                onClick={onSignOut}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-3 text-xs font-bold uppercase tracking-wider text-destructive transition-all hover:bg-destructive hover:text-destructive-foreground hover:shadow-[0_4px_10px_rgba(255,0,0,0.3)]"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative md:overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-background/20 via-transparent to-background/80 z-0" />
        <div className="relative z-10 flex-1 flex flex-col min-h-0 md:h-full md:overflow-hidden">
          {children}
        </div>
      </main>
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
