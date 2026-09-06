import * as React from "react"
import { useUser } from "@clerk/react"
import {
  getGetWorkspaceUsersQueryKey,
  useDeleteWorkspaceUser,
  useGetWorkspaceUsers,
  useInviteWorkspaceUser,
  useUpdateWorkspaceUser,
  type WorkspaceRole,
  type WorkspaceUser,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AppLayout } from "@/components/layout/app-layout"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Loader2, MailPlus, Pencil, Search, ShieldCheck, Trash2, Users as UsersIcon, X } from "lucide-react"

const ROLES: WorkspaceRole[] = ["Admin", "Project Manager", "Field Team", "Client"]
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Feedback = { kind: "success" | "error"; message: string } | null
type ErrorWithData = { data?: { error?: string }; message?: string }

function errorMessage(error: unknown, fallback: string) {
  const typed = error as ErrorWithData
  return typed.data?.error || typed.message || fallback
}

function RoleSelect({ value, onChange, disabled, id }: {
  value: WorkspaceRole
  onChange: (role: WorkspaceRole) => void
  disabled?: boolean
  id: string
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as WorkspaceRole)}
      disabled={disabled}
      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
    >
      {ROLES.map((role) => <option key={role}>{role}</option>)}
    </select>
  )
}

export default function Users() {
  const queryClient = useQueryClient()
  const { user: currentUser } = useUser()
  const usersQuery = useGetWorkspaceUsers()
  const inviteUser = useInviteWorkspaceUser()
  const updateUser = useUpdateWorkspaceUser()
  const deleteUser = useDeleteWorkspaceUser()
  const [search, setSearch] = React.useState("")
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState<WorkspaceRole>("Project Manager")
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<WorkspaceUser | null>(null)
  const [deleting, setDeleting] = React.useState<WorkspaceUser | null>(null)
  const [feedback, setFeedback] = React.useState<Feedback>(null)

  const users = usersQuery.data ?? []
  const pending = inviteUser.isPending || updateUser.isPending || deleteUser.isPending
  const visible = users.filter((user) =>
    `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: getGetWorkspaceUsersQueryKey() })

  const submitInvitation = async (event: React.FormEvent) => {
    event.preventDefault()
    setFeedback(null)
    const email = inviteEmail.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(email)) {
      setFeedback({ kind: "error", message: "Enter a valid email address." })
      return
    }
    try {
      await inviteUser.mutateAsync({ data: { email, role: inviteRole } })
      setInviteEmail("")
      setInviteRole("Project Manager")
      setInviteOpen(false)
      setFeedback({ kind: "success", message: `Invitation sent to ${email}.` })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to send the invitation.") })
    }
  }

  const submitEdit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editing) return
    setFeedback(null)
    if (!editing.firstName.trim() || !editing.lastName.trim()) {
      setFeedback({ kind: "error", message: "First and last name are required." })
      return
    }
    if (!EMAIL_PATTERN.test(editing.email.trim())) {
      setFeedback({ kind: "error", message: "Enter a valid email address." })
      return
    }
    try {
      const updated = await updateUser.mutateAsync({
        userId: editing.id,
        data: {
          firstName: editing.firstName.trim(),
          lastName: editing.lastName.trim(),
          email: editing.email.trim().toLowerCase(),
          role: editing.role,
        },
      })
      queryClient.setQueryData<WorkspaceUser[]>(getGetWorkspaceUsersQueryKey(), (current = []) =>
        current.map((user) => user.id === updated.id ? updated : user),
      )
      setEditing(null)
      setFeedback({ kind: "success", message: `${updated.name} was updated.` })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to update this user.") })
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    const removedName = deleting.name
    setFeedback(null)
    try {
      await deleteUser.mutateAsync({ userId: deleting.id })
      setDeleting(null)
      await refreshUsers()
      setFeedback({ kind: "success", message: `${removedName} was removed from the workspace.` })
    } catch (error) {
      setDeleting(null)
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to delete this user.") })
    }
  }

  return (
    <AppLayout>
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-6xl space-y-7">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[.2em] text-primary">
                <ShieldCheck className="h-4 w-4" />Access control
              </div>
              <h1 className="text-3xl font-extrabold sm:text-4xl">Users & Roles</h1>
              <p className="mt-2 text-muted-foreground">Manage who can access the Luminova workspace and assign their responsibility.</p>
            </div>
            <Button onClick={() => { setInviteOpen((open) => !open); setFeedback(null) }} disabled={pending} className="w-full sm:w-auto">
              {inviteOpen ? <X className="mr-2 h-4 w-4" /> : <MailPlus className="mr-2 h-4 w-4" />}
              {inviteOpen ? "Cancel invite" : "Invite user"}
            </Button>
          </header>

          <div aria-live="polite" aria-atomic="true">
            {feedback && (
              <div role={feedback.kind === "error" ? "alert" : "status"} className={`rounded-md border p-3 text-sm ${feedback.kind === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/40 bg-primary/10"}`}>
                {feedback.message}
              </div>
            )}
          </div>

          {inviteOpen && (
            <Card className="p-4 sm:p-6">
              <form onSubmit={submitInvitation} className="grid gap-4 sm:grid-cols-[1fr_220px_auto] sm:items-end" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email address</Label>
                  <Input id="invite-email" type="email" autoComplete="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@company.com" disabled={pending} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-role">Initial role</Label>
                  <RoleSelect id="invite-role" value={inviteRole} onChange={setInviteRole} disabled={pending} />
                </div>
                <Button type="submit" disabled={pending}>
                  {inviteUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send invitation
                </Button>
              </form>
            </Card>
          )}

          {usersQuery.isLoading ? (
            <Card className="flex items-center justify-center gap-3 p-10" role="status">
              <Loader2 className="h-5 w-5 animate-spin" />Loading workspace users…
            </Card>
          ) : usersQuery.isError ? (
            <Card className="p-10 text-center" role="alert">
              <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-primary" />
              <p>{errorMessage(usersQuery.error, "Unable to load users.")}</p>
              <Button variant="outline" className="mt-4" onClick={() => void usersQuery.refetch()}>Try again</Button>
            </Card>
          ) : (
            <>
              <div className="glass-panel p-4">
                <Label htmlFor="user-search" className="sr-only">Search users</Label>
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="user-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users, emails, or roles" />
                </div>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                <UsersIcon className="h-4 w-4" />{visible.length} {visible.length === 1 ? "user" : "users"}
              </div>
              {users.length === 0 ? (
                <Card className="p-10 text-center"><UsersIcon className="mx-auto mb-3 h-10 w-10 text-primary" /><p>No workspace users found.</p></Card>
              ) : visible.length === 0 ? (
                <Card className="p-10 text-center"><Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p>No users match your search.</p></Card>
              ) : (
                <div className="space-y-3">
                  {visible.map((user) => (
                    <Card key={user.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                      <img src={user.imageUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                      <div className="min-w-0 flex-1">
                        <h2 className="font-semibold">{user.name}</h2>
                        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <Badge variant={user.role === "Admin" ? "default" : "secondary"} className="self-start sm:self-auto">{user.role}</Badge>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setEditing({ ...user }); setFeedback(null) }} disabled={pending}>
                          <Pencil className="mr-2 h-4 w-4" />Edit
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setDeleting(user)} disabled={pending || user.id === currentUser?.id} title={user.id === currentUser?.id ? "You cannot delete your own account" : undefined}>
                          <Trash2 className="mr-2 h-4 w-4" />Remove
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AlertDialog open={Boolean(editing)} onOpenChange={(open) => !open && !updateUser.isPending && setEditing(null)}>
        <AlertDialogContent>
          <form onSubmit={submitEdit}>
            <AlertDialogHeader>
              <AlertDialogTitle>Edit workspace user</AlertDialogTitle>
              <AlertDialogDescription>Update this user’s Clerk profile and workspace role.</AlertDialogDescription>
            </AlertDialogHeader>
            {editing && (
              <div className="my-5 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="edit-first-name">First name</Label><Input id="edit-first-name" value={editing.firstName} onChange={(event) => setEditing({ ...editing, firstName: event.target.value })} disabled={pending} required /></div>
                <div className="space-y-2"><Label htmlFor="edit-last-name">Last name</Label><Input id="edit-last-name" value={editing.lastName} onChange={(event) => setEditing({ ...editing, lastName: event.target.value })} disabled={pending} required /></div>
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="edit-email">Email address</Label><Input id="edit-email" type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} disabled={pending} required /></div>
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="edit-role">Workspace role</Label><RoleSelect id="edit-role" value={editing.role} onChange={(role) => setEditing({ ...editing, role })} disabled={pending} /></div>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={pending}>Cancel</AlertDialogCancel>
              <Button type="submit" disabled={pending}>
                {updateUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && !deleteUser.isPending && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the user from Clerk and removes their workspace access. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep user</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={pending} onClick={() => void confirmDelete()}>
              {deleteUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  )
}