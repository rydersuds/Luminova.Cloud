import * as React from "react"
import { useLocation } from "wouter"
import { Archive, RotateCcw, Trash2 } from "lucide-react"
import {
  getGetDashboardSummaryQueryKey,
  getGetProjectDeletionPreviewQueryKey,
  getGetProjectsQueryKey,
  useArchiveProject,
  useDeleteProject,
  useGetProjectDeletionPreview,
  useRestoreProject,
} from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { useQueryClient } from "@tanstack/react-query"

type ProjectLifecycleActionsProps = {
  projectId: string
  projectName: string
  archived: boolean
}

export function ProjectLifecycleActions({
  projectId,
  projectName,
  archived,
}: ProjectLifecycleActionsProps) {
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const [action, setAction] = React.useState<"archive" | "delete" | null>(null)
  const [confirmation, setConfirmation] = React.useState("")
  const [previewStale, setPreviewStale] = React.useState(false)
  const archiveProject = useArchiveProject()
  const restoreProject = useRestoreProject()
  const deleteProject = useDeleteProject()
  const deletionPreview = useGetProjectDeletionPreview(projectId, {
    query: {
      queryKey: getGetProjectDeletionPreviewQueryKey(projectId),
      enabled: action === "delete",
      staleTime: 0,
      refetchOnMount: "always",
    },
  })
  const isPending = archiveProject.isPending || restoreProject.isPending || deleteProject.isPending

  const closeDialog = () => {
    if (isPending) return
    setAction(null)
    setConfirmation("")
    setPreviewStale(false)
  }

  const invalidateProjectLists = () => {
    void queryClient.invalidateQueries({ queryKey: getGetProjectsQueryKey() })
    void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })
  }

  const handleArchive = () => {
    archiveProject.mutate({ projectId }, {
      onSuccess: () => {
        invalidateProjectLists()
        toast({ title: "Project archived", description: "You can restore it from Archived Projects." })
        setLocation("/projects?archived=true")
      },
      onError: (error) => toast({
        title: "Could not archive project",
        description: error.message,
        variant: "destructive",
      }),
    })
  }

  const handleRestore = () => {
    restoreProject.mutate({ projectId }, {
      onSuccess: () => {
        invalidateProjectLists()
        toast({ title: "Project restored", description: "It is back in the active project list." })
        setLocation(`/projects/${projectId}`)
      },
      onError: (error) => toast({
        title: "Could not restore project",
        description: error.message,
        variant: "destructive",
      }),
    })
  }

  const handleDelete = () => {
    const previewToken = deletionPreview.data?.previewToken
    if (confirmation !== projectName || !previewToken) return
    deleteProject.mutate({ projectId, data: { previewToken } }, {
      onSuccess: () => {
        invalidateProjectLists()
        toast({ title: "Project permanently deleted" })
        setLocation("/projects")
      },
      onError: (error) => {
        if (
          (error as { status?: number }).status === 409
          && error.message.toLowerCase().includes("changed since this preview")
        ) {
          setConfirmation("")
          setPreviewStale(true)
          void queryClient.invalidateQueries({
            queryKey: getGetProjectDeletionPreviewQueryKey(projectId),
          })
          toast({
            title: "Review the deletion preview again",
            description: "The project changed after the preview was loaded. Check the updated counts and confirm again.",
            variant: "destructive",
          })
          return
        }
        toast({
          title: "Could not delete project",
          description: error.message,
          variant: "destructive",
        })
      },
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {archived ? (
          <Button
            variant="outline"
            className="max-w-full whitespace-normal border-border bg-transparent text-foreground hover:bg-card/60 hover:text-foreground"
            onClick={handleRestore}
            disabled={isPending}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restore project
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="max-w-full whitespace-normal text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            onClick={() => setAction("archive")}
            disabled={isPending}
          >
            <Archive className="mr-2 h-3.5 w-3.5" />
            Archive project
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="max-w-full whitespace-normal border-border/60 bg-transparent text-muted-foreground hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
          onClick={() => {
            setConfirmation("")
            setPreviewStale(false)
            setAction("delete")
          }}
          disabled={isPending}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete permanently
        </Button>
      </div>

      <Dialog open={action !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "archive" ? "Archive this project?" : "Permanently delete this project?"}
            </DialogTitle>
            <DialogDescription>
              {action === "archive"
                ? "The project will leave the active list, but its history and files will be kept. You can restore it later."
                : "This permanently removes the project and its project-specific records and files. Shared vendor profiles and other projects will not be deleted. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          {action === "delete" && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-card/50 p-3">
                <p className="text-sm font-medium text-foreground">Deletion preview</p>
                {deletionPreview.isFetching && !deletionPreview.data ? (
                  <p className="mt-1 text-sm text-muted-foreground">Loading project data counts…</p>
                ) : deletionPreview.isError ? (
                  <p className="mt-1 text-sm text-destructive">
                    {previewStale
                      ? "The preview could not be refreshed. Close this dialog and try again."
                      : "The deletion preview could not be loaded, so deletion is unavailable."}
                  </p>
                ) : deletionPreview.data ? (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {deletionPreview.data.recordCount.toLocaleString()} records and{" "}
                      {deletionPreview.data.storedFileCount.toLocaleString()} stored files will be removed.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Shared vendor profiles and other projects are excluded.
                    </p>
                  </>
                ) : null}
                {previewStale && deletionPreview.data && !deletionPreview.isFetching && (
                  <p role="status" className="mt-2 text-sm text-destructive">
                    The project changed after the previous preview. Review these updated counts and confirm again.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-project-delete">
                  Type <span className="font-semibold text-foreground">{projectName}</span> to confirm.
                </Label>
                <Input
                  id="confirm-project-delete"
                  autoComplete="off"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>Cancel</Button>
            {action === "archive" ? (
              <Button onClick={handleArchive} disabled={isPending}>
                {isPending ? "Archiving…" : "Archive project"}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={
                  isPending
                  || confirmation !== projectName
                  || !deletionPreview.data?.previewToken
                  || deletionPreview.isFetching
                  || deletionPreview.isError
                }
              >
                {isPending ? "Deleting…" : "Delete permanently"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
