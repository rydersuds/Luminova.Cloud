import * as React from "react"
import { useLocation } from "wouter"
import { Archive, RotateCcw, Trash2 } from "lucide-react"
import {
  getGetDashboardSummaryQueryKey,
  getGetProjectsQueryKey,
  useArchiveProject,
  useDeleteProject,
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
  const archiveProject = useArchiveProject()
  const restoreProject = useRestoreProject()
  const deleteProject = useDeleteProject()
  const isPending = archiveProject.isPending || restoreProject.isPending || deleteProject.isPending

  const closeDialog = () => {
    if (isPending) return
    setAction(null)
    setConfirmation("")
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
    if (confirmation !== projectName) return
    deleteProject.mutate({ projectId }, {
      onSuccess: () => {
        invalidateProjectLists()
        toast({ title: "Project permanently deleted" })
        setLocation("/projects")
      },
      onError: (error) => toast({
        title: "Could not delete project",
        description: error.message,
        variant: "destructive",
      }),
    })
  }

  return (
    <>
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
          variant="outline"
          className="max-w-full whitespace-normal border-border bg-transparent text-foreground hover:bg-card/60 hover:text-foreground"
          onClick={() => setAction("archive")}
          disabled={isPending}
        >
          <Archive className="mr-2 h-4 w-4" />
          Archive project
        </Button>
      )}
      <Button
        variant="destructive"
        className="max-w-full whitespace-normal"
        onClick={() => {
          setConfirmation("")
          setAction("delete")
        }}
        disabled={isPending}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete permanently
      </Button>

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
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>Cancel</Button>
            {action === "archive" ? (
              <Button onClick={handleArchive} disabled={isPending}>
                {isPending ? "Archiving…" : "Archive project"}
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleDelete} disabled={isPending || confirmation !== projectName}>
                {isPending ? "Deleting…" : "Delete permanently"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
