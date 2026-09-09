import * as React from "react"
import { useLocation } from "wouter"
import { useQueryClient } from "@tanstack/react-query"
import {
  getGetVendorQuotesQueryKey,
  useCreateVendorQuote,
  useGetProjects,
  useGetTrades,
  useGetVendorQuotes,
  useUpdateVendorQuote,
  type VendorQuote,
  type VendorQuoteStatus,
} from "@workspace/api-client-react"
import { AppLayout } from "@/components/layout/app-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import { cn, formatCurrency, formatDateOnly, getStatusColor } from "@/lib/utils"
import { Building2, CalendarClock, FilePenLine, FolderKanban, Layers3, Plus, Search, Trash2, Users, X } from "lucide-react"

const STATUSES: VendorQuoteStatus[] = ["Draft", "Requested", "Received", "Under review", "Accepted", "Declined", "Expired"]
type GroupMode = "all" | "project" | "vendor" | "trade"
type FormLine = { id: string; description: string; quantity: number; unitPrice: number }

const emptyLine = (): FormLine => ({ id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0 })
const today = () => new Date().toISOString().slice(0, 10)

export default function Quotes() {
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const initialProject = React.useMemo(() => new URLSearchParams(window.location.search).get("projectId") ?? "", [])
  const initialVendor = React.useMemo(() => new URLSearchParams(window.location.search).get("vendorId") ?? "", [])
  const [search, setSearch] = React.useState(() => new URLSearchParams(window.location.search).get("search") ?? "")
  const [projectId, setProjectId] = React.useState(initialProject)
  const [vendorId, setVendorId] = React.useState(initialVendor)
  const [trade, setTrade] = React.useState("")
  const [status, setStatus] = React.useState<VendorQuoteStatus | "">("")
  const [groupMode, setGroupMode] = React.useState<GroupMode>("all")
  const [editing, setEditing] = React.useState<VendorQuote | null | undefined>(undefined)

  const params = {
    search: search || undefined,
    projectId: projectId || undefined,
    vendorId: vendorId || undefined,
    trade: trade || undefined,
    status: status || undefined,
  }
  const quotesQuery = useGetVendorQuotes(params, { query: { queryKey: getGetVendorQuotesQueryKey(params) } })
  const { data: projects } = useGetProjects()
  const { data: vendors } = useGetTrades()
  const quotes = quotesQuery.data ?? []
  const tradeOptions = Array.from(new Set(vendors?.map((vendor) => vendor.tradeType) ?? [])).sort()
  const groups = React.useMemo(() => {
    if (groupMode === "all") return [["All quotes", quotes] as const]
    const grouped = new Map<string, VendorQuote[]>()
    for (const quote of quotes) {
      const key = groupMode === "project" ? quote.projectName : groupMode === "vendor" ? quote.vendorName : quote.trade
      grouped.set(key, [...(grouped.get(key) ?? []), quote])
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [groupMode, quotes])
  const totalValue = quotes.reduce((sum, quote) => sum + quote.total, 0)
  const dueSoonCutoff = React.useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + 14)
    return cutoff.toISOString().slice(0, 10)
  }, [])
  const dueSoon = quotes.filter((quote) => !["Accepted", "Declined", "Expired"].includes(quote.status) && quote.dueDate >= today() && quote.dueDate <= dueSoonCutoff).length

  const clearFilters = () => {
    setSearch("")
    setProjectId("")
    setVendorId("")
    setTrade("")
    setStatus("")
  }

  return (
    <AppLayout>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 md:p-8">
          <header className="flex flex-col gap-5 border-b border-border/60 pb-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-px w-6 bg-primary" />
                <span className="font-mono text-xs uppercase tracking-[0.22em] text-primary">Vendor pricing</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Quote Workspace</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review quotes submitted to Luminova by subcontractors, suppliers, and other vendors.</p>
            </div>
            <Button onClick={() => setEditing(null)} className="gap-2 self-start lg:self-auto"><Plus className="h-4 w-4" /> New vendor quote</Button>
          </header>

          <section className="grid gap-4 sm:grid-cols-3">
            <Summary icon={FilePenLine} label="Visible quotes" value={String(quotes.length)} />
            <Summary icon={Layers3} label="Combined value" value={formatCurrency(totalValue)} />
            <Summary icon={CalendarClock} label="Due soon" value={String(dueSoon)} />
          </section>

          <section className="glass-panel tech-border space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(220px,1fr)_repeat(4,170px)_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Quote, project, vendor, notes" className="bg-background/70 pl-9" />
              </div>
              <FilterSelect value={projectId} onChange={setProjectId} label="All projects" options={projects?.map((project) => [project.id, project.name]) ?? []} />
              <FilterSelect value={vendorId} onChange={setVendorId} label="All vendors" options={vendors?.map((vendor) => [vendor.id, vendor.companyName]) ?? []} />
              <FilterSelect value={trade} onChange={setTrade} label="All trades" options={tradeOptions.map((item) => [item, item])} />
              <FilterSelect value={status} onChange={(value) => setStatus(value as VendorQuoteStatus | "")} label="All statuses" options={STATUSES.map((item) => [item, item])} />
              <Button variant="outline" onClick={clearFilters} className="gap-2"><X className="h-4 w-4" /> Clear</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-4">
              <span className="mr-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Organize by</span>
              {(["all", "project", "vendor", "trade"] as GroupMode[]).map((mode) => (
                <Button key={mode} size="sm" variant={groupMode === mode ? "default" : "outline"} onClick={() => setGroupMode(mode)} className="capitalize">{mode === "all" ? "Complete list" : mode}</Button>
              ))}
            </div>
          </section>

          {quotesQuery.isLoading ? (
            <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <Card key={index} className="h-52 animate-pulse bg-muted/40" />)}</div>
          ) : quotesQuery.isError ? (
            <Empty title="Quotes could not be loaded" body="Check your connection and try again." action={<Button onClick={() => quotesQuery.refetch()}>Try again</Button>} />
          ) : quotes.length === 0 ? (
            <Empty title="No matching vendor quotes" body="Adjust the filters or create the first quote for this project." action={<Button onClick={() => setEditing(null)}>Create quote</Button>} />
          ) : (
            <div className="space-y-7">
              {groups.map(([name, items]) => (
                <section key={name} className="space-y-3">
                  {groupMode !== "all" && <div className="flex items-center gap-3"><h2 className="text-lg font-bold">{name}</h2><Badge variant="secondary">{items.length}</Badge><span className="h-px flex-1 bg-border" /></div>}
                  <div className="grid gap-4 lg:grid-cols-2">
                    {items.map((quote) => <QuoteCard key={quote.id} quote={quote} onEdit={() => setEditing(quote)} onProject={() => setLocation(`/projects/${quote.projectId}`)} onVendor={() => setLocation(`/trades/${quote.vendorId}`)} />)}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
      <QuoteDialog
        quote={editing}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        projects={projects ?? []}
        vendors={vendors ?? []}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: getGetVendorQuotesQueryKey() })
          setEditing(undefined)
        }}
      />
    </AppLayout>
  )
}

function Summary({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return <Card className="border-border/60 bg-card/75"><CardContent className="flex items-center gap-4 p-5"><div className="flex h-11 w-11 items-center justify-center bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><div><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold tabular-nums">{value}</p></div></CardContent></Card>
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: string[][] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 border border-border bg-background/70 px-3 text-sm outline-none focus:border-primary"><option value="">{label}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
}

function QuoteCard({ quote, onEdit, onProject, onVendor }: { quote: VendorQuote; onEdit: () => void; onProject: () => void; onVendor: () => void }) {
  return (
    <Card className="overflow-hidden border-border/60 bg-card/80 transition-colors hover:border-primary/35">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 p-5">
          <div className="min-w-0 flex-1"><p className="break-words font-mono text-xs text-primary">{quote.quoteNumber} · REV {quote.revision}</p><h3 className="mt-1 break-words text-lg font-bold">{quote.trade}</h3></div>
          <div className="flex max-w-full flex-wrap items-end justify-end gap-2">
            <Badge variant={getStatusColor(quote.status) as any}>{quote.status}</Badge>
             <Badge variant="outline">Sent to Luminova</Badge>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 p-5 text-sm min-[420px]:grid-cols-2">
          <button onClick={onProject} className="min-w-0 break-words text-left hover:text-primary"><span className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><FolderKanban className="h-3.5 w-3.5 shrink-0" />Project</span><strong className="break-words">{quote.projectName}</strong></button>
          <button onClick={onVendor} className="min-w-0 break-words text-left hover:text-primary"><span className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><Users className="h-3.5 w-3.5 shrink-0" />From company</span><strong className="break-words">{quote.vendorName}</strong></button>
          <div><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Due date</span><p className="mt-1 font-medium">{formatDateOnly(quote.dueDate)}</p></div>
          <div><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Quote total</span><p className="mt-1 text-lg font-bold tabular-nums">{formatCurrency(quote.total)}</p></div>
        </div>
        <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-5 py-3"><span className="text-xs text-muted-foreground">{quote.lineItems.length} line item{quote.lineItems.length === 1 ? "" : "s"}</span><Button variant="ghost" size="sm" onClick={onEdit} className="gap-2"><FilePenLine className="h-4 w-4" /> Edit</Button></div>
      </CardContent>
    </Card>
  )
}

function Empty({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return <div className="glass-panel py-16 text-center"><Building2 className="mx-auto mb-4 h-11 w-11 text-primary/45" /><h2 className="text-xl font-bold">{title}</h2><p className="mx-auto mb-5 mt-2 max-w-md text-sm text-muted-foreground">{body}</p>{action}</div>
}

function QuoteDialog({ quote, open, onOpenChange, projects, vendors, onSaved }: { quote: VendorQuote | null | undefined; open: boolean; onOpenChange: (open: boolean) => void; projects: Array<{ id: string; name: string }>; vendors: Array<{ id: string; companyName: string; tradeType: string }>; onSaved: () => void }) {
  const createQuote = useCreateVendorQuote()
  const updateQuote = useUpdateVendorQuote()
  const [projectId, setProjectId] = React.useState("")
  const [vendorId, setVendorId] = React.useState("")
  const [quoteNumber, setQuoteNumber] = React.useState("")
  const [trade, setTrade] = React.useState("")
  const [status, setStatus] = React.useState<VendorQuoteStatus>("Draft")
  const [revision, setRevision] = React.useState(1)
  const [issueDate, setIssueDate] = React.useState(today())
  const [dueDate, setDueDate] = React.useState(today())
  const [notes, setNotes] = React.useState("")
  const [lines, setLines] = React.useState<FormLine[]>([emptyLine()])
  const [validation, setValidation] = React.useState("")

  React.useEffect(() => {
    if (!open) return
    setProjectId(quote?.projectId ?? "")
    setVendorId(quote?.vendorId ?? "")
    setQuoteNumber(quote?.quoteNumber ?? "")
    setTrade(quote?.trade ?? "")
    setStatus(quote?.status ?? "Draft")
    setRevision(quote?.revision ?? 1)
    setIssueDate(quote?.issueDate ?? today())
    setDueDate(quote?.dueDate ?? today())
    setNotes(quote?.notes ?? "")
    setLines(quote?.lineItems.map((line) => ({ id: line.id, description: line.description, quantity: line.quantity, unitPrice: line.unitPrice })) ?? [emptyLine()])
    setValidation("")
  }, [open, quote])

  const total = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice), 0)
  const pending = createQuote.isPending || updateQuote.isPending
  const save = (event: React.FormEvent) => {
    event.preventDefault()
    if (!projectId || !vendorId || !quoteNumber.trim() || !trade.trim() || lines.some((line) => !line.description.trim() || line.quantity <= 0 || line.unitPrice < 0)) {
      setValidation("Complete all required fields and add valid line item values.")
      return
    }
    if (dueDate < issueDate) {
      setValidation("Due date cannot be before the issue date.")
      return
    }
    const data = {
      quoteNumber: quoteNumber.trim(),
      projectId,
      vendorId,
      direction: "company_to_luminova" as const,
      trade: trade.trim(),
      status,
      revision,
      issueDate,
      dueDate,
      notes,
      lineItems: lines.map(({ id, ...line }) => ({ ...line, id })),
    }
    const options = {
      onSuccess: () => { toast({ title: quote ? "Quote updated" : "Quote created", description: `${quoteNumber} was saved successfully.` }); onSaved() },
      onError: () => setValidation("The quote could not be saved. Review the fields and try again."),
    }
    if (quote) updateQuote.mutate({ quoteId: quote.id, data }, options)
    else createQuote.mutate({ data }, options)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{quote ? "Edit vendor quote" : "Create vendor quote"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Direction"><Input value="Vendor → Luminova" readOnly className="bg-muted/40" /></Field>
            <Field label="Project"><select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-10 w-full border border-input bg-background px-3 text-sm"><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
            <Field label="Vendor / company">
              <select value={vendorId} onChange={(e) => { setVendorId(e.target.value); const vendor = vendors.find((item) => item.id === e.target.value); if (vendor) setTrade(vendor.tradeType) }} className="h-10 w-full border border-input bg-background px-3 text-sm"><option value="">Select vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.companyName}</option>)}</select>
            </Field>
            <Field label="Quote number"><Input value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} /></Field>
            <Field label="Trade"><Input value={trade} readOnly className="bg-muted/40" /></Field>
            <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value as VendorQuoteStatus)} className="h-10 w-full border border-input bg-background px-3 text-sm">{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Revision"><Input type="number" min={1} value={revision} onChange={(e) => setRevision(Number(e.target.value))} /></Field>
            <Field label="Issue date"><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></Field>
            <Field label="Due date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          </div>
          <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scope clarifications, exclusions, pricing validity…" /></Field>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><Label>Line items</Label><Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, emptyLine()])}><Plus className="mr-1 h-4 w-4" /> Add line</Button></div>
            {lines.map((line, index) => (
              <div key={line.id} className="grid gap-2 border border-border/60 bg-muted/20 p-3 sm:grid-cols-[1fr_90px_140px_40px]">
                <Input aria-label={`Line ${index + 1} description`} placeholder="Description" value={line.description} onChange={(e) => setLines(lines.map((item) => item.id === line.id ? { ...item, description: e.target.value } : item))} />
                <Input aria-label="Quantity" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => setLines(lines.map((item) => item.id === line.id ? { ...item, quantity: Number(e.target.value) } : item))} />
                <Input aria-label="Unit price" type="number" min="0" step="1" value={line.unitPrice} onChange={(e) => setLines(lines.map((item) => item.id === line.id ? { ...item, unitPrice: Number(e.target.value) } : item))} />
                <Button type="button" variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines(lines.filter((item) => item.id !== line.id))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-y border-border py-4"><span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Calculated total</span><strong className="text-2xl tabular-nums">{formatCurrency(total)}</strong></div>
          {validation && <p role="alert" className="text-sm font-medium text-destructive">{validation}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save quote"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>
}