import {
  getGetCurrentWorkspaceUserQueryKey,
  getGetProjectLifecycleEventsQueryKey,
  useGetCurrentWorkspaceUser,
  useGetProjectLifecycleEvents,
} from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { History, Loader2, RefreshCw, ShieldCheck } from "lucide-react"

const ACTION_LABELS = {
  archived: "Archived",
  restored: "Restored",
  permanently_deleted: "Permanently deleted",
} as const

export default function ProjectHistory() {
  const userQuery = useGetCurrentWorkspaceUser({
    query: { queryKey: getGetCurrentWorkspaceUserQueryKey(), retry: false },
  })
  const isAdmin = userQuery.data?.role === "Admin"
  const eventsQuery = useGetProjectLifecycleEvents({
    query: { queryKey: getGetProjectLifecycleEventsQueryKey(), enabled: isAdmin, retry: false },
  })

  if (userQuery.isLoading) {
    return <section className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">Checking administrator access…</section>
  }

  if (userQuery.isError || !isAdmin) {
    return (
      <section className="flex flex-1 items-center justify-center p-8">
        <Card className="max-w-lg p-6 text-center">
          <ShieldCheck className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Administrator access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Project lifecycle history is available to workspace Administrators only.
          </p>
        </Card>
      </section>
    )
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 md:px-8 md:py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Workspace administration</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
            <History className="h-5 w-5 text-primary" />
            Project history
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Administrator records of project archives, restores, and permanent deletions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void eventsQuery.refetch()}
          disabled={eventsQuery.isFetching}
        >
          {eventsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </header>

      <Card className="min-h-0 overflow-hidden">
        {eventsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading project history…
          </div>
        ) : eventsQuery.isError ? (
          <div className="p-6 text-sm text-destructive" role="alert">
            Project history could not be loaded. {eventsQuery.error instanceof Error ? eventsQuery.error.message : ""}
          </div>
        ) : !eventsQuery.data?.length ? (
          <div className="p-10 text-center">
            <History className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            <p className="font-medium">No project lifecycle events yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Archive, restore, and deletion events will appear here.</p>
          </div>
        ) : (
          <div className="max-h-full overflow-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-card text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="border-b px-4 py-3 font-medium">Date and time</th>
                  <th scope="col" className="border-b px-4 py-3 font-medium">Action</th>
                  <th scope="col" className="border-b px-4 py-3 font-medium">Project</th>
                  <th scope="col" className="border-b px-4 py-3 font-medium">Actor ID</th>
                  <th scope="col" className="border-b px-4 py-3 font-medium">Workspace</th>
                </tr>
              </thead>
              <tbody>
                {eventsQuery.data.map((event) => (
                  <tr key={event.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium">{ACTION_LABELS[event.action]}</td>
                    <td className="max-w-sm px-4 py-3">
                      <p className="break-words font-medium">{event.projectName}</p>
                      <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{event.projectId}</p>
                    </td>
                    <td className="break-all px-4 py-3 font-mono text-xs">{event.actorId}</td>
                    <td className="break-all px-4 py-3 font-mono text-xs text-muted-foreground">{event.workspaceId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  )
}
