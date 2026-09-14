export const pageModules = {
  dashboard: () => import("@/pages/dashboard"),
  projects: () => import("@/pages/projects"),
  projectDetail: () => import("@/pages/projects/[id]"),
  trades: () => import("@/pages/trades"),
  tradeDetail: () => import("@/pages/trades/[id]"),
  invoices: () => import("@/pages/invoices"),
  messages: () => import("@/pages/messages"),
  users: () => import("@/pages/users"),
  quotes: () => import("@/pages/quotes"),
  profile: () => import("@/pages/profile"),
}

const primaryPageLoaders = [
  pageModules.dashboard,
  pageModules.projects,
  pageModules.trades,
  pageModules.invoices,
  pageModules.quotes,
  pageModules.messages,
  pageModules.users,
]

export function preloadPage(href: string) {
  const loader =
    href === "/" ? pageModules.dashboard
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

export function preloadPrimaryPages() {
  primaryPageLoaders.forEach((loader) => void loader())
}