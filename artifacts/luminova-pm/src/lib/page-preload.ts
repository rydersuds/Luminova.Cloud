export const pageModules = {
  dashboard: () => import("@/pages/dashboard"),
  mobileOverview: () => import("@/pages/mobile-overview"),
  projects: () => import("@/pages/projects"),
  projectDetail: () => import("@/pages/projects/[id]"),
  trades: () => import("@/pages/trades"),
  tradeDetail: () => import("@/pages/trades/[id]"),
  invoices: () => import("@/pages/invoices"),
  messages: () => import("@/pages/messages"),
  users: () => import("@/pages/users"),
  quotes: () => import("@/pages/quotes"),
  profile: () => import("@/pages/profile"),
  schedule: () => import("@/pages/schedule"),
  approvals: () => import("@/pages/approvals"),
}

type NetworkInformationLike = {
  saveData?: boolean
  effectiveType?: string
  downlink?: number
  rtt?: number
}

export type PreloadEnvironment = {
  onLine?: boolean
  connection?: NetworkInformationLike
  deviceMemory?: number
  hardwareConcurrency?: number
}

const primaryPageLoaders = [
  { href: "/", loader: pageModules.dashboard },
  { href: "/projects", loader: pageModules.projects },
  { href: "/schedule", loader: pageModules.schedule },
  { href: "/trades", loader: pageModules.trades },
  { href: "/invoices", loader: pageModules.invoices },
  { href: "/quotes", loader: pageModules.quotes },
  { href: "/messages", loader: pageModules.messages },
  { href: "/users", loader: pageModules.users },
]

const workspacePaths = ["/mobile", "/projects", "/schedule", "/approvals", "/trades", "/invoices", "/quotes", "/messages", "/users", "/profile"]

function browserPreloadEnvironment(): PreloadEnvironment | undefined {
  if (typeof navigator === "undefined") return undefined
  return navigator as PreloadEnvironment
}

export function canPreloadPrimaryPages(
  environment: PreloadEnvironment | undefined = browserPreloadEnvironment(),
) {
  if (!environment || environment.onLine === false) return false

  const connection = environment.connection
  if (connection?.saveData) return false
  if (connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return false
  if (connection?.downlink !== undefined && connection.downlink < 1.5) return false
  if (connection?.rtt !== undefined && connection.rtt > 500) return false

  // A speculative module burst is not useful on devices with very little
  // memory or CPU available for the current page.
  if (environment.deviceMemory !== undefined && environment.deviceMemory <= 1) return false
  if (environment.hardwareConcurrency !== undefined && environment.hardwareConcurrency <= 2) return false

  return true
}

export function isWorkspacePath(href: string) {
  const path = href.split(/[?#]/, 1)[0] || "/"
  return path === "/" || workspacePaths.some((basePath) => path === basePath || path.startsWith(`${basePath}/`))
}

export function preloadPage(href: string) {
  const loader =
    href === "/" ? pageModules.dashboard
      : href === "/mobile" ? pageModules.mobileOverview
      : href === "/projects" ? pageModules.projects
        : href.startsWith("/projects/") ? pageModules.projectDetail
          : href === "/trades" ? pageModules.trades
            : href.startsWith("/trades/") ? pageModules.tradeDetail
              : href === "/invoices" ? pageModules.invoices
                : href === "/quotes" ? pageModules.quotes
                  : href === "/messages" ? pageModules.messages
                    : href === "/users" ? pageModules.users
                        : href === "/profile" ? pageModules.profile
                      : undefined

  if (loader) void loader()
}

export function preloadPrimaryPages(currentHref?: string) {
  if (!canPreloadPrimaryPages()) return

  const currentPath = currentHref?.split(/[?#]/, 1)[0] || ""
  primaryPageLoaders.forEach(({ href, loader }) => {
    if (currentPath === href || (href !== "/" && currentPath.startsWith(`${href}/`))) return
    void loader()
  })
}
