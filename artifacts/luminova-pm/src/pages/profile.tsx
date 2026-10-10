import { useUser } from "@clerk/react"
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react"
import { Link } from "wouter"
import { useGetCurrentWorkspaceUser } from "@workspace/api-client-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProfilePhotoControl } from "@/components/profile-photo-control"

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/30 p-4">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  )
}

export default function Profile() {
  const { isLoaded, user } = useUser()
  const workspaceUser = useGetCurrentWorkspaceUser()

  if (!isLoaded) {
    return (
      <main className="flex h-full items-center justify-center text-muted-foreground" data-testid="profile-page">
        <p className="font-mono text-xs uppercase tracking-[0.2em]">Loading profile…</p>
      </main>
    )
  }

  const displayName = user?.fullName || user?.firstName || "Project Manager"
  const email = user?.primaryEmailAddress?.emailAddress || "Signed in"
  const role = workspaceUser.data?.role
    || (typeof user?.publicMetadata?.role === "string" ? user.publicMetadata.role : "Workspace member")

  return (
    <main className="h-full overflow-y-auto bg-background/35" data-testid="profile-page">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-primary">
              <span className="h-px w-6 bg-primary" />
              Account settings
            </p>
            <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">Your profile</h1>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card/50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to workspace
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
          <Card className="overflow-hidden">
            <div className="border-b border-border/60 bg-gradient-to-br from-primary/15 via-card/60 to-transparent p-6 md:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                {user && (
                  <ProfilePhotoControl
                    userId={user.id}
                    name={displayName}
                    imageUrl={user.imageUrl}
                    size="lg"
                    onUploaded={() => void user.reload()}
                  />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-heading text-2xl font-bold">{displayName}</h2>
                    <Badge variant="default">{role}</Badge>
                  </div>
                </div>
              </div>
            </div>
            <CardHeader>
              <CardTitle>Account information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <DetailRow icon={Mail} label="Email address" value={email} />
              <DetailRow icon={CheckCircle2} label="Account status" value="Active" />
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Account security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Contact a workspace administrator if you need your name, email, or role updated.
              </p>
              <details>
                <summary className="cursor-pointer font-medium text-foreground">Sign-in details</summary>
                <p className="mt-2">Sign-in is managed by your workspace authentication provider.</p>
              </details>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}