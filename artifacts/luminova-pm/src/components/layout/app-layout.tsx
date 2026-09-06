import { Link, useLocation } from "wouter"
import { 
  Building2, 
  FolderKanban,
  Users, 
  FileText, 
  MessageSquare, 
  Menu,
  X
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"

const NAV_ITEMS = [
  { href: "/", label: "Command Center", icon: Building2 },
  { href: "/projects", label: "All Projects", icon: FolderKanban },
  { href: "/trades", label: "Trades & Vendors", icon: Users },
  { href: "/invoices", label: "Financials", icon: FileText },
  { href: "/messages", label: "Communications", icon: MessageSquare },
]

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background bg-tech-grid text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between p-4 glass-panel-dark text-sidebar-foreground z-30 relative border-b border-sidebar-border shadow-md">
        <div className="flex items-center">
          <img src="/luminova-logo.png" alt="Luminova Construction" className="h-10 w-36 object-contain object-left drop-shadow-md" />
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 -mr-2 text-primary hover:text-primary/80 transition-colors">
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-20 md:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Futuristic Sidebar */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 w-72 glass-panel-dark text-sidebar-foreground flex flex-col z-30 transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] border-r border-sidebar-border/50",
        sidebarOpen ? "translate-x-0 shadow-2xl shadow-primary/10" : "-translate-x-full md:translate-x-0"
      )}>
        {/* Top Branding Area */}
        <div className="px-6 py-8 hidden md:flex flex-col relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
          <img src="/luminova-logo.png" alt="Luminova Construction" className="h-14 w-44 object-contain object-left drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" />
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-6 md:py-2 space-y-2 overflow-y-auto">
          <div className="text-[10px] font-mono uppercase tracking-widest text-sidebar-foreground/40 mb-4 px-2">System Modules</div>
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-3 rounded-none text-sm font-medium transition-all duration-300 overflow-hidden",
                  isActive 
                    ? "text-primary-foreground tech-border bg-primary/90 gold-glow" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:pl-5"
                )}
                onClick={() => setSidebarOpen(false)}
              >
                {isActive && (
                  <span className="absolute left-0 top-0 bottom-0 w-1 bg-white opacity-50"></span>
                )}
                <item.icon size={18} className={cn("transition-transform duration-300", isActive ? "scale-110" : "group-hover:scale-110 group-hover:text-primary")} />
                <span className="relative z-10 tracking-wide">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* User / Status Bottom Area */}
        <div className="p-4 border-t border-sidebar-border/50 mt-auto bg-black/20 backdrop-blur-md">
          <div className="flex items-center gap-3 px-3 py-3 text-sm text-sidebar-foreground hover:text-white transition-colors cursor-pointer tech-clip bg-sidebar-accent/50 hover:bg-sidebar-accent border border-sidebar-border">
            <div className="w-9 h-9 rounded-none bg-primary flex items-center justify-center font-heading font-bold text-primary-foreground shadow-[0_0_10px_rgba(0,0,0,0.5)]">
              PM
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="font-medium truncate tracking-wide">Project Manager</p>
              <p className="text-xs font-mono opacity-60 truncate">pm@luminova.build</p>
            </div>
          </div>
          
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative md:overflow-hidden">
        {/* Subtle overlay gradient to give depth */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-background/20 via-transparent to-background/80 z-0"></div>
        <div className="relative z-10 flex-1 flex flex-col min-h-0 md:h-full md:overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  )
}