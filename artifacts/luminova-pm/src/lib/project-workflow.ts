export const PROJECT_TABS = ["board", "overview", "photos", "budget", "trades", "activity"] as const
export type ProjectTab = (typeof PROJECT_TABS)[number]

/** Keep existing projects on Overview unless a team member explicitly opens a tab. */
export function projectTabFromSearch(search: string, canUseBoard = true): ProjectTab {
  const value = new URLSearchParams(search).get("tab")
  const tab = PROJECT_TABS.find(candidate => candidate === value) ?? "overview"
  return tab === "board" && !canUseBoard ? "overview" : tab
}

export function projectWorkflowHref(path: string, projectId: string, extra: Record<string, string> = {}) {
  const query = new URLSearchParams({ projectId, ...extra })
  return `${path}?${query}`
}