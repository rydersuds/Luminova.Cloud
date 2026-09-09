import * as React from "react"
import { useUser } from "@clerk/react"
import {
  getGetWorkspaceUsersQueryKey,
  getGetWorkspaceInvitationsQueryKey,
  getGetClientsQueryKey,
  useCreateClient,
  useDeleteClient,
  useGetClients,
  useGrantClientAccess,
  useRevokeClientAccess,
  useDeleteWorkspaceUser,
  useGetWorkspaceInvitations,
  useGetWorkspaceUsers,
  useInviteWorkspaceUser,
  useResendWorkspaceInvitation,
  useRevokeWorkspaceInvitation,
  useUpdateWorkspaceUser,
  type WorkspaceRole,
  type WorkspaceInvitation,
  type WorkspaceUser,
  type Client as ClientOrganization,
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
import { Building2, Loader2, MailPlus, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserPlus, UserRoundMinus, Users as UsersIcon, X } from "lucide-react"

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
  const invitationsQuery = useGetWorkspaceInvitations()
  const clientsQuery = useGetClients()
  const inviteUser = useInviteWorkspaceUser()
  const createClient = useCreateClient()
  const deleteClient = useDeleteClient()
  const grantClientAccess = useGrantClientAccess()
  const revokeClientAccess = useRevokeClientAccess()
  const resendInvitation = useResendWorkspaceInvitation()
  const revokeInvitation = useRevokeWorkspaceInvitation()
  const updateUser = useUpdateWorkspaceUser()
  const deleteUser = useDeleteWorkspaceUser()
  const [search, setSearch] = React.useState("")
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState<WorkspaceRole>("Project Manager")
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<WorkspaceUser | null>(null)
  const [deleting, setDeleting] = React.useState<WorkspaceUser | null>(null)
  const [revoking, setRevoking] = React.useState<WorkspaceInvitation | null>(null)
  const [resendingId, setResendingId] = React.useState<string | null>(null)
  const [feedback, setFeedback] = React.useState<Feedback>(null)
  const [activeTab, setActiveTab] = React.useState<"users" | "clients">("users")
  const [clientName, setClientName] = React.useState("")
  const [selectedMemberByClient, setSelectedMemberByClient] = React.useState<Record<string, string>>({})
  const [deletingClient, setDeletingClient] = React.useState<ClientOrganization | null>(null)

  const users = usersQuery.data ?? []
  const pending = inviteUser.isPending || updateUser.isPending || deleteUser.isPending || resendInvitation.isPending || revokeInvitation.isPending
  const clientsPending = createClient.isPending || deleteClient.isPending || grantClientAccess.isPending || revokeClientAccess.isPending
  const visible = users.filter((user) =>
    `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: getGetWorkspaceUsersQueryKey() })
  const refreshInvitations = () => queryClient.invalidateQueries({ queryKey: getGetWorkspaceInvitationsQueryKey() })
  const refreshClients = () => queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() })

  const submitClient = async (event: React.FormEvent) => {
    event.preventDefault()
    setFeedback(null)
    const name = clientName.trim()
    if (!name) {
      setFeedback({ kind: "error", message: "Enter a client name." })
      return
    }
    try {
      await createClient.mutateAsync({ data: { name } })
      setClientName("")
      await refreshClients()
      setFeedback({ kind: "success", message: `${name} was added as a client.` })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to add this client.") })
    }
  }

  const grantAccess = async (client: ClientOrganization) => {
    const userId = selectedMemberByClient[client.id]
    if (!userId) {
      setFeedback({ kind: "error", message: "Select a Client user before granting access." })
      return
    }
    setFeedback(null)
    try {
      await grantClientAccess.mutateAsync({ clientId: client.id, data: { userId } })
      setSelectedMemberByClient((current) => ({ ...current, [client.id]: "" }))
      await refreshClients()
      setFeedback({ kind: "success", message: "Client access granted." })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to grant client access.") })
    }
  }

  const revokeAccess = async (client: ClientOrganization, userId: string, name: string) => {
    setFeedback(null)
    try {
      await revokeClientAccess.mutateAsync({ clientId: client.id, userId })
      await refreshClients()
      setFeedback({ kind: "success", message: `${name}'s access was revoked.` })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to revoke client access.") })
    }
  }

  const confirmDeleteClient = async () => {
    if (!deletingClient) return
    const name = deletingClient.name
    setFeedback(null)
    try {
      await deleteClient.mutateAsync({ clientId: deletingClient.id })
      setDeletingClient(null)
      await refreshClients()
      setFeedback({ kind: "success", message: `${name} was deleted.` })
    } catch (error) {
      setDeletingClient(null)
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to delete this client.") })
    }
  }

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
      await refreshInvitations()
      setFeedback({ kind: "success", message: `Invitation sent to ${email}.` })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to send the invitation.") })
    }
  }

  const resend = async (invitation: WorkspaceInvitation) => {
    setFeedback(null)
    setResendingId(invitation.id)
    try {
      await resendInvitation.mutateAsync({ invitationId: invitation.id })
      await refreshInvitations()
      setFeedback({ kind: "success", message: `A new invitation was sent to ${invitation.email}.` })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to resend this invitation.") })
    } finally {
      setResendingId(null)
    }
  }

  const confirmRevoke = async () => {
    if (!revoking) return
    const email = revoking.email
    setFeedback(null)
    try {
      await revokeInvitation.mutateAsync({ invitationId: revoking.id })
      setRevoking(null)
      await refreshInvitations()
      setFeedback({ kind: "success", message: `The invitation for ${email} was canceled.` })
    } catch (error) {
      setRevoking(null)
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to cancel this invitation.") })
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
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-6xl space-y-7">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[.2em] text-primary">
                <ShieldCheck className="h-4 w-4" />Access control
              </div>
              <h1 className="text-3xl font-extrabold sm:text-4xl">Users & Roles</h1>
              <p className="mt-2 text-muted-foreground">
                {activeTab === "users"
                  ? "Manage who can access the Luminova workspace and assign their responsibility."
                  : "Organize client accounts and control which client users can access each one."}
              </p>
            </div>
            {activeTab === "users" && (
              <Button onClick={() => { setInviteOpen((open) => !open); setFeedback(null) }} disabled={pending} className="w-full sm:w-auto">
                {inviteOpen ? <X className="mr-2 h-4 w-4" /> : <MailPlus className="mr-2 h-4 w-4" />}
                {inviteOpen ? "Cancel invite" : "Invite user"}
              </Button>
            )}
          </header>

          <div role="tablist" aria-label="Access management sections" className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-card/30 p-1 sm:inline-flex">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "users"}
              onClick={() => { setActiveTab("users"); setFeedback(null) }}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${activeTab === "users" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"}`}
            >
              <UsersIcon className="mr-2 inline-block h-4 w-4" />Users & Roles
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "clients"}
              onClick={() => { setActiveTab("clients"); setInviteOpen(false); setFeedback(null) }}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${activeTab === "clients" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"}`}
            >
              <Building2 className="mr-2 inline-block h-4 w-4" />Clients
            </button>
          </div>

          <div aria-live="polite" aria-atomic="true">
            {feedback && (
              <div role={feedback.kind === "error" ? "alert" : "status"} className={`rounded-md border p-3 text-sm ${feedback.kind === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/40 bg-primary/10"}`}>
                {feedback.message}
              </div>
            )}
          </div>

          {activeTab === "users" ? (
            <>
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

          <section aria-labelledby="pending-invitations-heading" className="space-y-3">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              <MailPlus className="h-4 w-4" />
              <h2 id="pending-invitations-heading">Pending invitations</h2>
            </div>
            {invitationsQuery.isLoading ? (
              <Card className="flex items-center justify-center gap-3 p-6" role="status">
                <Loader2 className="h-5 w-5 animate-spin" />Loading pending invitations…
              </Card>
            ) : invitationsQuery.isError ? (
              <Card className="p-6 text-center" role="alert">
                <p>{errorMessage(invitationsQuery.error, "Unable to load pending invitations.")}</p>
                <Button variant="outline" className="mt-4" onClick={() => void invitationsQuery.refetch()}>Try again</Button>
              </Card>
            ) : invitationsQuery.data?.length ? (
              <div className="space-y-3">
                {invitationsQuery.data.map((invitation) => (
                  <Card key={invitation.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{invitation.email}</p>
                      <p className="text-sm text-muted-foreground">
                        Sent {new Date(invitation.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="secondary" className="self-start sm:self-auto">{invitation.role}</Badge>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => void resend(invitation)} disabled={pending}>
                        {resendingId === invitation.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        {resendingId === invitation.id ? "Resending…" : "Resend"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setRevoking(invitation)} disabled={pending}>
                        <X className="mr-2 h-4 w-4" />Cancel invitation
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-6 text-center text-sm text-muted-foreground">No pending invitations.</Card>
            )}
          </section>

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
            </>
          ) : (
            <>
              <Card className="p-4 sm:p-6">
                <form onSubmit={submitClient} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="client-name">Client name</Label>
                    <Input id="client-name" value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="e.g. North Ridge Development" disabled={clientsPending} required />
                  </div>
                  <Button type="submit" disabled={clientsPending}>
                    {createClient.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Add client
                  </Button>
                </form>
              </Card>

              {clientsQuery.isLoading ? (
                <Card className="flex items-center justify-center gap-3 p-10" role="status">
                  <Loader2 className="h-5 w-5 animate-spin" />Loading clients…
                </Card>
              ) : clientsQuery.isError ? (
                <Card className="p-10 text-center" role="alert">
                  <Building2 className="mx-auto mb-3 h-10 w-10 text-primary" />
                  <p>{errorMessage(clientsQuery.error, "Unable to load clients.")}</p>
                  <Button variant="outline" className="mt-4" onClick={() => void clientsQuery.refetch()}>Try again</Button>
                </Card>
              ) : clientsQuery.data?.length ? (
                <div className="space-y-4">
                  {clientsQuery.data.map((client) => {
                    const memberIds = new Set(client.members.map((member) => member.userId))
                    const availableUsers = users.filter((user) => user.role === "Client" && !memberIds.has(user.id))
                    return (
                      <Card key={client.id} className="space-y-5 p-4 sm:p-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="rounded-lg border border-primary/30 bg-primary/10 p-2 text-primary"><Building2 className="h-5 w-5" /></div>
                            <div className="min-w-0">
                              <h2 className="truncate text-lg font-semibold">{client.name}</h2>
                              <p className="text-sm text-muted-foreground">{client.members.length} {client.members.length === 1 ? "person" : "people"} with access</p>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" className="self-start text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeletingClient(client)} disabled={clientsPending}>
                            <Trash2 className="mr-2 h-4 w-4" />Delete client
                          </Button>
                        </div>

                        <div className="grid gap-3 rounded-lg border border-border/70 bg-card/30 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
                          <div className="space-y-2">
                            <Label htmlFor={`client-member-${client.id}`}>Grant access to a Client user</Label>
                            <select
                              id={`client-member-${client.id}`}
                              value={selectedMemberByClient[client.id] ?? ""}
                              onChange={(event) => setSelectedMemberByClient((current) => ({ ...current, [client.id]: event.target.value }))}
                              disabled={clientsPending || availableUsers.length === 0}
                              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <option value="">{availableUsers.length ? "Select a person…" : "No unassigned Client users"}</option>
                              {availableUsers.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}
                            </select>
                          </div>
                          <Button type="button" onClick={() => void grantAccess(client)} disabled={clientsPending || !selectedMemberByClient[client.id]}>
                            {grantClientAccess.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <UserPlus className="mr-2 h-4 w-4" />Grant access
                          </Button>
                        </div>

                        {client.members.length ? (
                          <div className="space-y-2">
                            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">People with access</p>
                            <div className="space-y-2">
                              {client.members.map((member) => (
                                <div key={member.id} className="flex flex-col gap-3 rounded-md border border-border/60 p-3 sm:flex-row sm:items-center">
                                  <img src={member.imageUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium">{member.name}</p>
                                    <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                                  </div>
                                  <Badge variant="secondary">{member.role}</Badge>
                                  <Button type="button" variant="ghost" size="sm" className="self-start text-muted-foreground hover:text-destructive sm:self-auto" onClick={() => void revokeAccess(client, member.userId, member.name)} disabled={clientsPending}>
                                    <UserRoundMinus className="mr-2 h-4 w-4" />Revoke
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">No people have access to this client yet.</p>
                        )}
                      </Card>
                    )
                  })}
                </div>
              ) : (
                <Card className="p-10 text-center">
                  <Building2 className="mx-auto mb-3 h-10 w-10 text-primary" />
                  <p className="font-medium">No clients have been added yet.</p>
                  <p className="mt-1 text-sm text-muted-foreground">Add a client above, then grant access to their Client users.</p>
                </Card>
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

      <AlertDialog open={Boolean(revoking)} onOpenChange={(open) => !open && !revokeInvitation.isPending && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              The invitation link sent to {revoking?.email} will stop working. You can invite this email again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep invitation</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={pending} onClick={() => void confirmRevoke()}>
              {revokeInvitation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Cancel invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deletingClient)} onOpenChange={(open) => !open && !deleteClient.isPending && setDeletingClient(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingClient?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the client organization and revokes access for everyone assigned to it. The workspace users themselves will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clientsPending}>Keep client</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={clientsPending} onClick={() => void confirmDeleteClient()}>
              {deleteClient.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete client
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  )
}