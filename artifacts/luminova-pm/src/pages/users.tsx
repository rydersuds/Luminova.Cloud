import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, ShieldCheck, Users as UsersIcon } from "lucide-react"

type AppUser = { id: string; name: string; email: string; role: string; createdAt: number; lastSignInAt: number | null; imageUrl: string }
const ROLES = ["Admin", "Project Manager", "Field Team", "Client"]

export default function Users() {
  const [users, setUsers] = React.useState<AppUser[]>([])
  const [search, setSearch] = React.useState("")
  const [error, setError] = React.useState("")

  const load = React.useCallback(async () => {
    await fetch("/api/users/me")
    const response = await fetch("/api/users")
    if (!response.ok) {
      setError(response.status === 403 ? "Only administrators can manage users and roles." : "Unable to load users.")
      return
    }
    setUsers(await response.json())
  }, [])

  React.useEffect(() => { void load() }, [load])

  const changeRole = async (id: string, role: string) => {
    const response = await fetch(`/api/users/${id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
    if (response.ok) setUsers((current) => current.map((user) => user.id === id ? { ...user, role } : user))
  }

  const visible = users.filter((user) => `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(search.toLowerCase()))

  return <AppLayout>
    <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-7">
        <header>
          <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[.2em] text-primary"><ShieldCheck className="h-4 w-4" />Access control</div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">Users & Roles</h1>
          <p className="mt-2 text-muted-foreground">Manage who can access the Luminova workspace and assign their responsibility.</p>
        </header>
        {error ? <Card className="p-10 text-center"><ShieldCheck className="mx-auto mb-3 h-10 w-10 text-primary"/><p>{error}</p></Card> : <>
          <div className="glass-panel p-4">
            <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users, emails, or roles"/></div>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground"><UsersIcon className="h-4 w-4"/>{visible.length} users</div>
          <div className="space-y-3">{visible.map((user) => <Card key={user.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
            <img src={user.imageUrl} alt="" className="h-12 w-12 object-cover"/>
            <div className="min-w-0 flex-1"><h2 className="font-semibold">{user.name}</h2><p className="truncate text-sm text-muted-foreground">{user.email}</p></div>
            <Badge variant={user.role === "Admin" ? "default" : "secondary"} className="self-start sm:self-auto">{user.role}</Badge>
            <select value={user.role} onChange={(e) => void changeRole(user.id, e.target.value)} className="h-10 border border-border bg-background px-3 text-sm">
              {ROLES.map((role) => <option key={role}>{role}</option>)}
            </select>
          </Card>)}</div>
        </>}
      </div>
    </div>
  </AppLayout>
}