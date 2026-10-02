export const PROJECT_TABS = ["overview", "photos", "budget", "trades", "activity"] as const
export type ProjectTab = (typeof PROJECT_TABS)[number]

export function projectTabFromSearch(search: string): ProjectTab {
  const value = new URLSearchParams(search).get("tab")
  return PROJECT_TABS.find(tab => tab === value) ?? "overview"
}

export function projectWorkflowHref(path: string, projectId: string, extra: Record<string, string> = {}) {
  const query = new URLSearchParams({ projectId, ...extra })
  return `${path}?${query}`
}