import { Link, useLocation } from "wouter"
import { 
  Building2, 
  Users, 
  FileText, 
  MessageSquare, 
  LogOut, 
  Settings,
  Menu,
  X,
  CheckCircle2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { useHealthCheck } from "@workspace/api-client-react"

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Building2 },
  { href: "/trades", label: "Trades & Vendors", icon: Users },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/messages", label: "Messages", icon: MessageSquare },
]

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { data: health } = useHealthCheck()

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-sidebar text-sidebar-foreground border-b border-sidebar-border z-20 relative">
        <div className="flex items-center">
          <img src="/luminova-logo.avif" alt="Luminova Construction" className="h-10 w-36 object-contain object-left" />
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 -mr-2">
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-10 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 w-64 bg-sidebar text-sidebar-foreground flex flex-col z-20 transition-transform duration-300 border-r border-sidebar-border",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="px-5 py-4 hidden md:flex items-center">
          <img src="/luminova-logo.avif" alt="Luminova Construction" className="h-14 w-44 object-contain object-left" />
        </div>

        <nav className="flex-1 px-3 py-6 md:py-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border mt-auto">
          <div className="flex items-center gap-3 px-3 py-2 text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground transition-colors cursor-pointer rounded-md hover:bg-sidebar-accent">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center font-heading font-semibold text-sidebar-foreground">
              PM
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="font-medium truncate">Project Manager</p>
              <p className="text-xs opacity-70 truncate">pm@luminova.build</p>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
              <Settings size={18} />
              Settings
            </button>
            <Link href="/login" className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
              <LogOut size={18} />
              Sign out
            </Link>
          </div>
          {health?.status === "ok" && (
            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-sidebar-foreground/40">
              <CheckCircle2 className="h-3 w-3 text-success" />
              <span>System Operational</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  )
}
