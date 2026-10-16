import * as React from "react"
import { useUser } from "@clerk/react"
import {
  getGetWorkspaceUsersQueryKey,
  getGetWorkspaceInvitationsQueryKey,
  getGetClientsQueryKey,
  getGetInvoicesQueryKey,
  getGetProjectsQueryKey,
  useRequestClientLogoUpload,
  useAttachClientLogo,
  useClearClientLogo,
  useCreateClient,
  useDeleteClient,
  useGetClients,
  useGrantClientAccess,
  useRevokeClientAccess,
  useReconcileAllClientAccess,
  useReconcileClientAccess,
  useDeleteWorkspaceUser,
  useGetWorkspaceInvitations,
  useGetWorkspaceUsers,
  useInviteClientUser,
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
import { AlertTriangle, Building2, Loader2, MailPlus, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserPlus, UserRoundMinus, Users as UsersIcon, X } from "lucide-react"
import { ClientIdentity } from "@/components/client-identity"
import { uploadToSignedUrl, validateImageFile } from "@/lib/image-upload"
import { ProfilePhotoControl } from "@/components/profile-photo-control"

const ROLES: WorkspaceRole[] = ["Admin", "Project Manager", "Field Team", "Client"]
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Feedback = { kind: "success" | "error"; message: string } | null
type ErrorWithData = { data?: { error?: string }; message?: string }

function errorMessage(error: unknown, fallback: string) {
  const typed = error as ErrorWithData
  return typed.data?.error || typed.message || fallback
}

function invitationAcceptedMessage(email: string) {
  return `Clerk accepted the invitation request for ${email}, but this app cannot confirm inbox delivery. Ask the recipient to verify the address and check spam. If it is missing, review Clerk Email Logs and delivery settings before resending.`
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
  const requestClientLogoUpload = useRequestClientLogoUpload()
  const attachClientLogo = useAttachClientLogo()
  const clearClientLogo = useClearClientLogo()
  const grantClientAccess = useGrantClientAccess()
  const inviteClientUser = useInviteClientUser()
  const revokeClientAccess = useRevokeClientAccess()
  const reconcileAllClientAccess = useReconcileAllClientAccess()
  const reconcileClientAccess = useReconcileClientAccess()
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
  const [clientAddMode, setClientAddMode] = React.useState<Record<string, "existing" | "invite">>({})
  const [clientInviteEmailByClient, setClientInviteEmailByClient] = React.useState<Record<string, string>>({})
  const [deletingClient, setDeletingClient] = React.useState<ClientOrganization | null>(null)
  const [reconcilingUserId, setReconcilingUserId] = React.useState<string | null>(null)

  const users = usersQuery.data ?? []
  const pending = inviteUser.isPending || updateUser.isPending || deleteUser.isPending || resendInvitation.isPending || revokeInvitation.isPending || reconcileClientAccess.isPending || reconcileAllClientAccess.isPending
  const clientsPending = createClient.isPending || deleteClient.isPending || grantClientAccess.isPending || inviteClientUser.isPending || revokeClientAccess.isPending
  const [logoBusyClientId, setLogoBusyClientId] = React.useState<string | null>(null)
  const [logoProgress, setLogoProgress] = React.useState(0)
  const visible = users.filter((user) =>
    `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const projectManagers = visible.filter((user) => user.role === "Project Manager")
  const otherWorkspaceUsers = visible.filter((user) => user.role !== "Project Manager")
  const hasSearch = search.trim().length > 0
  const pendingReconciliations = users.filter((user) => user.clientAccessCleanupPending)

  const switchTab = (tab: "users" | "clients") => {
    setActiveTab(tab)
    setInviteOpen(false)
    setFeedback(null)
  }

  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: getGetWorkspaceUsersQueryKey() })
  const refreshInvitations = () => queryClient.invalidateQueries({ queryKey: getGetWorkspaceInvitationsQueryKey() })
  const refreshClients = () => queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() })
  const refreshClientBranding = () => Promise.all([
    refreshClients(),
    queryClient.invalidateQueries({ queryKey: getGetProjectsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetInvoicesQueryKey() }),
    queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
        typeof queryKey[0] === "string" && /^\/api\/projects\/[^/]+$/.test(queryKey[0]),
    }),
  ])

  const retryClientAccessCleanup = async (user: WorkspaceUser) => {
    setFeedback(null)
    setReconcilingUserId(user.id)
    try {
      await reconcileClientAccess.mutateAsync({ userId: user.id })
      await refreshUsers()
      setFeedback({ kind: "success", message: `${user.name}'s client access was reconciled.` })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to reconcile client access.") })
    } finally {
      setReconcilingUserId(null)
    }
  }

  const retryAllClientAccessCleanup = async () => {
    setFeedback(null)
    try {
      const result = await reconcileAllClientAccess.mutateAsync()
      await refreshUsers()
      if (result.failed.length) {
        const succeededMessage = result.reconciled.length
          ? `${result.reconciled.length} cleanup${result.reconciled.length === 1 ? "" : "s"} reconciled. `
          : ""
        setFeedback({
          kind: "error",
          message: `${succeededMessage}${result.failed.length} cleanup${result.failed.length === 1 ? "" : "s"} still need attention. Retry them individually.`,
        })
      } else {
        setFeedback({
          kind: "success",
          message: `${result.reconciled.length} client access cleanup${result.reconciled.length === 1 ? "" : "s"} reconciled.`,
        })
      }
    } catch (error) {
      await refreshUsers()
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to reconcile client access.") })
    }
  }

  const uploadLogo = async (client: ClientOrganization, file: File) => {
    setFeedback(null)
    setLogoBusyClientId(client.id)
    setLogoProgress(0)
    try {
      const validation = validateImageFile(file, {
        minBytes: 1,
        messages: {
          "unsupported-type": "Choose a JPEG, PNG, or WebP image.",
          "too-small": "Client logos must not be empty.",
          "too-large": "Client logos must be smaller than 8 MB.",
        },
      })
      if (!validation.valid) throw new Error(validation.message)
      const upload = await requestClientLogoUpload.mutateAsync({
        clientId: client.id,
        data: { name: file.name, size: file.size, contentType: validation.contentType },
      })
      await uploadToSignedUrl(file, upload.uploadURL, {
        onProgress: setLogoProgress,
        errorMessage: "The logo upload failed.",
      })
      await attachClientLogo.mutateAsync({ clientId: client.id, data: { objectPath: upload.objectPath } })
      await refreshClientBranding()
      setFeedback({ kind: "success", message: `${client.name}'s logo was saved.` })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to save this client logo.") })
    } finally {
      setLogoBusyClientId(null)
      setLogoProgress(0)
    }
  }

  const removeLogo = async (client: ClientOrganization) => {
    setFeedback(null)
    setLogoBusyClientId(client.id)
    try {
      await clearClientLogo.mutateAsync({ clientId: client.id })
      await refreshClientBranding()
      setFeedback({ kind: "success", message: `${client.name}'s logo was removed.` })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to remove this client logo.") })
    } finally {
      setLogoBusyClientId(null)
    }
  }

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

  const inviteClient = async (client: ClientOrganization) => {
    const email = (clientInviteEmailByClient[client.id] ?? "").trim().toLowerCase()
    if (!EMAIL_PATTERN.test(email)) {
      setFeedback({ kind: "error", message: "Enter a valid email address for the client user." })
      return
    }
    setFeedback(null)
    try {
      await inviteClientUser.mutateAsync({ clientId: client.id, data: { email } })
      setClientInviteEmailByClient((current) => ({ ...current, [client.id]: "" }))
      await Promise.all([refreshClients(), refreshInvitations(), refreshUsers()])
      setFeedback({ kind: "success", message: invitationAcceptedMessage(email) })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to invite this client user.") })
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
      setFeedback({ kind: "success", message: invitationAcceptedMessage(email) })
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
      setFeedback({ kind: "success", message: invitationAcceptedMessage(invitation.email) })
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
      await Promise.all([refreshInvitations(), refreshClients()])
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

  const renderUserCard = (user: WorkspaceUser) => (
    <Card key={user.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <ProfilePhotoControl
        userId={user.id}
        name={user.name}
        imageUrl={user.imageUrl}
        disabled={pending}
        onUploaded={(imageUrl) => {
          queryClient.setQueryData<WorkspaceUser[]>(getGetWorkspaceUsersQueryKey(), (current = []) =>
            current.map((candidate) => candidate.id === user.id ? { ...candidate, imageUrl } : candidate),
          )
        }}
      />
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold">{user.name}</h3>
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
      </div>
      <Badge variant={user.role === "Admin" ? "default" : "secondary"} className="self-start sm:self-auto">{user.role}</Badge>
      {user.clientAccessCleanupPending && (
        <Badge variant="outline" className="w-fit border-amber-500/50 text-amber-700 dark:text-amber-300">Cleanup pending</Badge>
      )}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => { setEditing({ ...user }); setFeedback(null) }} disabled={pending}>
          <Pencil className="mr-2 h-4 w-4" />Edit
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setDeleting(user)} disabled={pending || user.id === currentUser?.id} title={user.id === currentUser?.id ? "You cannot delete your own account" : undefined}>
          <Trash2 className="mr-2 h-4 w-4" />Remove
        </Button>
      </div>
    </Card>
  )

  return (
    <>
      <div data-testid="users-page-scroll" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 md:p-8">
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
              onClick={() => switchTab("users")}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${activeTab === "users" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"}`}
            >
              <UsersIcon className="mr-2 inline-block h-4 w-4" />Users & Roles
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "clients"}
              onClick={() => switchTab("clients")}
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
              {pendingReconciliations.length > 0 && (
                <Card className="border-amber-500/40 bg-amber-500/10 p-4 sm:p-5" role="alert">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">Client access needs reconciliation</h2>
                        <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
                          {pendingReconciliations.length} pending
                        </Badge>
                        {pendingReconciliations.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="ml-auto"
                            onClick={() => void retryAllClientAccessCleanup()}
                            disabled={pending || reconcilingUserId !== null}
                          >
                            {reconcileAllClientAccess.isPending
                              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              : <RefreshCw className="mr-2 h-4 w-4" />}
                            {reconcileAllClientAccess.isPending ? "Retrying all…" : "Retry all cleanup"}
                          </Button>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Role changes succeeded, but client access could not be removed for these users.
                      </p>
                      <div className="mt-4 space-y-2">
                        {pendingReconciliations.map((user) => (
                          <div key={user.id} className="flex flex-col gap-3 rounded-md border border-amber-500/30 bg-background/50 p-3 sm:flex-row sm:items-center">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{user.name}</p>
                              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void retryClientAccessCleanup(user)}
                              disabled={pending || reconcilingUserId !== null}
                            >
                              {reconcilingUserId === user.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              {reconcilingUserId !== user.id && <RefreshCw className="mr-2 h-4 w-4" />}
                              {reconcilingUserId === user.id ? "Retrying…" : "Retry cleanup"}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              )}
              <div className="glass-panel p-4">
                <Label htmlFor="user-search" className="sr-only">Search users</Label>
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="user-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users, emails, or roles" />
                </div>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                <UsersIcon className="h-4 w-4" />{visible.length} matching {visible.length === 1 ? "user" : "users"}
              </div>
              {users.length === 0 ? (
                <Card className="p-10 text-center"><UsersIcon className="mx-auto mb-3 h-10 w-10 text-primary" /><p>No workspace users found.</p></Card>
              ) : (
                <div className="space-y-8">
                  <section aria-labelledby="project-managers-heading" data-testid="project-managers-section" className="space-y-3">
                    <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      <UsersIcon className="h-4 w-4" />
                      <h2 id="project-managers-heading">Project Managers</h2>
                      <Badge variant="secondary" data-testid="project-managers-count" aria-label={`${projectManagers.length} Project Manager ${projectManagers.length === 1 ? "user" : "users"}`}>
                        {projectManagers.length}
                      </Badge>
                    </div>
                    {projectManagers.length ? (
                      <div className="space-y-3">
                        {projectManagers.map(renderUserCard)}
                      </div>
                    ) : (
                      <Card className="p-6 text-center text-sm text-muted-foreground">
                        <Search className="mx-auto mb-3 h-8 w-8" />
                        <p>{hasSearch ? "No Project Managers match your search." : "No Project Managers found."}</p>
                      </Card>
                    )}
                  </section>

                  <section aria-labelledby="other-workspace-users-heading" data-testid="other-workspace-users-section" className="space-y-3">
                    <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      <UsersIcon className="h-4 w-4" />
                      <h2 id="other-workspace-users-heading">Other workspace users</h2>
                      <Badge variant="secondary" data-testid="other-workspace-users-count" aria-label={`${otherWorkspaceUsers.length} other workspace ${otherWorkspaceUsers.length === 1 ? "user" : "users"}`}>
                        {otherWorkspaceUsers.length}
                      </Badge>
                    </div>
                    {otherWorkspaceUsers.length ? (
                      <div className="space-y-3">
                        {otherWorkspaceUsers.map(renderUserCard)}
                      </div>
                    ) : (
                      <Card className="p-6 text-center text-sm text-muted-foreground">
                        <Search className="mx-auto mb-3 h-8 w-8" />
                        <p>{hasSearch ? "No other workspace users match your search." : "No other workspace users found."}</p>
                      </Card>
                    )}
                  </section>
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
                            <ClientIdentity name={client.name} logoUrl={client.logoUrl} size="lg" />
                            <div className="min-w-0">
                              <h2 className="truncate text-lg font-semibold">{client.name}</h2>
                              <p className="text-sm text-muted-foreground">{client.members.length} {client.members.length === 1 ? "person" : "people"} with access</p>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" className="self-start text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeletingClient(client)} disabled={clientsPending}>
                            <Trash2 className="mr-2 h-4 w-4" />Delete client
                          </Button>
                        </div>

                        <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <ClientIdentity name={client.name} logoUrl={client.logoUrl} size="sm" />
                            <div>
                              <p className="font-medium">Client logo</p>
                              <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP · up to 8 MB</p>
                              {logoBusyClientId === client.id && <p role="status" className="text-xs text-primary">{logoProgress ? `Uploading ${logoProgress}%` : "Preparing upload…"}</p>}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                              {client.logoUrl ? "Replace logo" : "Add logo"}
                              <input
                                type="file"
                                className="sr-only"
                                accept="image/jpeg,image/png,image/webp"
                                disabled={logoBusyClientId !== null}
                                onChange={(event) => {
                                  const file = event.target.files?.[0]
                                  event.target.value = ""
                                  if (file) void uploadLogo(client, file)
                                }}
                              />
                            </label>
                            {client.logoUrl && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => void removeLogo(client)} disabled={logoBusyClientId !== null}>
                                {clearClientLogo.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Remove
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-3 rounded-lg border border-border/70 bg-card/30 p-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-medium">Add a person</p>
                              <p className="text-xs text-muted-foreground">Choose an existing Client user or invite someone new.</p>
                            </div>
                            <div role="group" aria-label={`Add a person to ${client.name}`} className="flex rounded-md border border-border bg-background p-1">
                              <button
                                type="button"
                                aria-pressed={(clientAddMode[client.id] ?? "existing") === "existing"}
                                onClick={() => setClientAddMode((current) => ({ ...current, [client.id]: "existing" }))}
                                disabled={clientsPending}
                                className={`rounded px-3 py-1.5 text-xs font-medium ${(clientAddMode[client.id] ?? "existing") === "existing" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                              >
                                Existing user
                              </button>
                              <button
                                type="button"
                                aria-pressed={clientAddMode[client.id] === "invite"}
                                onClick={() => setClientAddMode((current) => ({ ...current, [client.id]: "invite" }))}
                                disabled={clientsPending}
                                className={`rounded px-3 py-1.5 text-xs font-medium ${clientAddMode[client.id] === "invite" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                              >
                                Invite by email
                              </button>
                            </div>
                          </div>
                          {(clientAddMode[client.id] ?? "existing") === "existing" ? (
                            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                              <div className="space-y-2">
                                <Label htmlFor={`client-member-${client.id}`}>Workspace Client user</Label>
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
                                <UserPlus className="mr-2 h-4 w-4" />Add existing user
                              </Button>
                            </div>
                          ) : (
                            <form
                              className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
                              onSubmit={(event) => { event.preventDefault(); void inviteClient(client) }}
                              noValidate
                            >
                              <div className="space-y-2">
                                <Label htmlFor={`client-invite-${client.id}`}>Email address</Label>
                                <Input
                                  id={`client-invite-${client.id}`}
                                  type="email"
                                  autoComplete="email"
                                  placeholder="name@company.com"
                                  value={clientInviteEmailByClient[client.id] ?? ""}
                                  onChange={(event) => setClientInviteEmailByClient((current) => ({ ...current, [client.id]: event.target.value }))}
                                  disabled={clientsPending}
                                  required
                                />
                              </div>
                              <Button type="submit" disabled={clientsPending}>
                                {inviteClientUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <MailPlus className="mr-2 h-4 w-4" />Send client invitation
                              </Button>
                            </form>
                          )}
                        </div>

                        {(client.pendingInvitations ?? []).length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Pending client invitations</p>
                              <Badge variant="outline">{client.pendingInvitations.length}</Badge>
                            </div>
                            <div className="space-y-2">
                              {client.pendingInvitations.map((invitation) => (
                                <div key={invitation.id} className="flex flex-col gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 sm:flex-row sm:items-center">
                                  <MailPlus className="h-4 w-4 shrink-0 text-primary" />
                                  <p className="min-w-0 flex-1 truncate text-sm">{invitation.email}</p>
                                  <Badge variant="secondary">Invitation pending</Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

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
    </>
  )
}
