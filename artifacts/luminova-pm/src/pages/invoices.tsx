import * as React from "react"
import {
  useGetInvoices,
  getGetInvoicesQueryKey,
  useGetFinancialSummary,
  getGetFinancialSummaryQueryKey,
  getGetDashboardSummaryQueryKey,
  useGetInvoiceProjects,
  getGetInvoiceProjectsQueryKey,
  useGetInvoiceSubmissions,
  getGetInvoiceSubmissionsQueryKey,
  useGetCurrentWorkspaceUser,
  getGetCurrentWorkspaceUserQueryKey,
  type Invoice,
} from "@workspace/api-client-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Filter, AlertTriangle, Search, Plus, ArrowUpRight, ArrowDownRight, Clock3, RefreshCw, Paperclip, CheckCircle2 } from "lucide-react"
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import { ClientIdentity } from "@/components/client-identity"
import { InvoiceUploadForm } from "@/components/invoice-upload-form"

const isPending = (status: string) => status.toLowerCase().startsWith("pending")

function InvoiceDetail({ invoice }: { invoice: Invoice }) {
  const [dlError, setDlError] = React.useState(false)
  const download = async () => {
    if (!invoice.attachment) return
    setDlError(false)
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "")
      const raw = invoice.attachment.url
      const href = raw.startsWith("/") && base && !raw.startsWith(`${base}/`) ? `${base}${raw}` : raw
      const res = await fetch(href, { credentials: "include" })
      if (!res.ok) throw new Error("download")
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement("a")
      a.href = url
      a.download = invoice.attachment.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setDlError(true)
    }
  }
  const reason = invoice.approvalReason
  const pending = isPending(invoice.status)
  return (
    <div className="mt-2 space-y-1 text-xs text-muted-foreground" data-testid={`detail-invoice-${invoice.id}`}>
      {reason === "within_budget" && (
        <p>Budget basis: remaining trade/category budget. {invoice.budgetRemainingBefore != null && `${formatCurrency(invoice.budgetRemainingBefore)} remaining before`}{invoice.budgetRemainingAfter != null && `, ${formatCurrency(invoice.budgetRemainingAfter)} after`}.</p>
      )}
      {reason === "over_budget" && (
        <p className="text-destructive">Over the remaining trade/category budget{invoice.budgetRemainingBefore != null && ` (${formatCurrency(invoice.budgetRemainingBefore)} was remaining)`}{invoice.overage > 0 && ` by ${formatCurrency(invoice.overage)}`}.</p>
      )}
      {reason === "budget_unavailable" && <p className="text-warning">No matching or priced budget was available for this invoice.</p>}
      {pending && invoice.submittedById && (
        <p className="font-medium text-foreground">Contact leadership outside this app for authorization. Do not proceed with this work until it is authorized.</p>
      )}
      {invoice.attachment && (
        <button type="button" onClick={download} className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline" data-testid={`link-invoice-file-${invoice.id}`}>
          <Paperclip className="h-3 w-3" /> {invoice.attachment.name}
        </button>
      )}
      {dlError && <p role="alert" className="text-destructive">The file could not be downloaded. Try again.</p>}
    </div>
  )
}

export default function Invoices() {
  const [statusFilter, setStatusFilter] = React.useState("")
  const [search, setSearch] = React.useState(() => new URLSearchParams(window.location.search).get("search") ?? "")
  const [isSubmitOpen, setIsSubmitOpen] = React.useState(false)
  const [formLocked, setFormLocked] = React.useState(false)
  const [result, setResult] = React.useState<Invoice | null>(null)
  const queryClient = useQueryClient()

  const me = useGetCurrentWorkspaceUser({ query: { queryKey: getGetCurrentWorkspaceUserQueryKey(), retry: false } })
  const role = me.data?.role
  const isAdmin = role === "Admin"
  const canSubmit = isAdmin || role === "Project Manager"
  const showLegacyInvoices = role !== undefined && role !== "Project Manager"

  const invoicesQuery = useGetInvoices(undefined, {
    query: { queryKey: getGetInvoicesQueryKey(), enabled: showLegacyInvoices },
  })
  const submissions = useGetInvoiceSubmissions({
    query: { queryKey: getGetInvoiceSubmissionsQueryKey(), enabled: canSubmit, refetchInterval: 30_000 },
  })
  const projectsQuery = useGetInvoiceProjects({
    query: { queryKey: getGetInvoiceProjectsQueryKey(), enabled: canSubmit, staleTime: 0, refetchOnMount: "always" },
  })
  const financialSummary = useGetFinancialSummary({
    query: { queryKey: getGetFinancialSummaryQueryKey(), retry: false, enabled: isAdmin },
  })

  const isLoading = me.isLoading || (showLegacyInvoices && invoicesQuery.isLoading) || (canSubmit && submissions.isLoading)

  const rows = React.useMemo(() => {
    const map = new Map<string, Invoice>()
    if (showLegacyInvoices) for (const i of invoicesQuery.data ?? []) map.set(i.id, i)
    if (canSubmit) for (const i of submissions.data ?? []) map.set(i.id, i)
    const q = search.trim().toLowerCase()
    return Array.from(map.values()).filter((i) => {
      if (statusFilter === "Pending" ? !isPending(i.status) : statusFilter && i.status !== statusFilter) return false
      return !q || [i.invoiceNumber, i.vendor, i.projectName, i.lineItem].some((v) => v?.toLowerCase().includes(q))
    })
  }, [showLegacyInvoices, canSubmit, invoicesQuery.data, submissions.data, search, statusFilter])
  const invoices = rows

  const handleSubmitted = (invoice: Invoice) => {
    setResult(invoice)
    setIsSubmitOpen(false)
    for (const queryKey of [
      getGetInvoiceProjectsQueryKey(),
      getGetInvoiceSubmissionsQueryKey(),
      getGetInvoicesQueryKey(),
      getGetFinancialSummaryQueryKey(),
      getGetDashboardSummaryQueryKey(),
      [`/api/projects/${invoice.projectId}`],
    ]) queryClient.invalidateQueries({ queryKey })
  }

  const pendingCount = invoices.filter((i) => isPending(i.status)).length

  return (
    <>
      <div className="flex-1 overflow-x-hidden overflow-y-auto bg-background p-6 md:p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-px w-6 bg-primary" />
                <span className="font-mono text-xs uppercase tracking-[0.22em] text-primary">Portfolio financials</span>
              </div>
              <h1 className="text-3xl font-heading font-bold text-foreground">{isAdmin ? "Financial Overview" : "Invoices & Purchases"}</h1>
              <p className="text-muted-foreground mt-1 text-sm">{isAdmin ? "Track client revenue, project expenses, and accepted work still available to invoice." : "Submit vendor invoices against remaining trade budgets and track their approval status."}</p>
            </div>
            
            {canSubmit && (
              <Dialog open={isSubmitOpen} onOpenChange={(open) => {
                if (!open && formLocked) return
                setIsSubmitOpen(open)
                if (open) void projectsQuery.refetch()
              }}>
                <DialogTrigger asChild>
                  <Button className="gap-2" data-testid="button-open-submit-invoice">
                    <Plus className="h-4 w-4" />
                    Submit Invoice
                  </Button>
                </DialogTrigger>
                <DialogContent
                  className="max-h-[90dvh] overflow-y-auto"
                  onInteractOutside={(e) => { if (formLocked) e.preventDefault() }}
                  onEscapeKeyDown={(e) => { if (formLocked) e.preventDefault() }}
                >
                  <DialogHeader>
                    <DialogTitle>Submit vendor invoice</DialogTitle>
                  </DialogHeader>
                  {projectsQuery.isLoading ? (
                    <p className="py-6 text-sm text-muted-foreground">Loading your projects...</p>
                  ) : projectsQuery.isError ? (
                    <div className="space-y-3 py-4">
                      <p role="alert" className="text-sm text-destructive">Projects could not be loaded{projectsQuery.error instanceof Error ? `: ${projectsQuery.error.message}` : ""}.</p>
                      <Button variant="outline" onClick={() => projectsQuery.refetch()}>Retry</Button>
                    </div>
                  ) : (projectsQuery.data ?? []).length === 0 ? (
                    <p className="py-6 text-sm text-muted-foreground">No projects are available for invoice submission.</p>
                  ) : (
                    <InvoiceUploadForm projects={projectsQuery.data ?? []} onSubmitted={handleSubmitted} onLockChange={setFormLocked} />
                  )}
                </DialogContent>
              </Dialog>
            )}
          </div>

          {(me.isError || (showLegacyInvoices && invoicesQuery.isError) || (canSubmit && submissions.isError)) && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <span>Invoice records could not be loaded. These are not verified zero totals.</span>
              <Button variant="outline" size="sm" onClick={() => {
                if (me.isError) void me.refetch()
                if (showLegacyInvoices) void invoicesQuery.refetch()
                if (canSubmit) void submissions.refetch()
              }}>Retry invoices</Button>
            </div>
          )}

          {result && (
            <section role="status" className="rounded-lg border border-border bg-card p-4" data-testid="panel-submit-result">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div className="min-w-0 text-sm">
                  <p className="font-bold">Invoice {result.invoiceNumber}: {result.status}</p>
                  <p className="mt-1 text-muted-foreground">{formatCurrency(result.amount)} for {result.projectName}.</p>
                  {isPending(result.status) && (
                    <p className="mt-1 font-medium">
                      {result.overage > 0 && `Over budget by ${formatCurrency(result.overage)}. `}
                      Contact leadership outside this app for authorization. Do not proceed until it is authorized.
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setResult(null)}>Dismiss</Button>
              </div>
            </section>
          )}

          {isAdmin && (
          <FinancialSummary
              data={financialSummary.data}
              isLoading={financialSummary.isLoading}
              isError={financialSummary.isError}
              onRetry={() => financialSummary.refetch()}
            />
          )}

          <div className="border-t border-border/60 pt-2">
            <h2 className="text-xl font-heading font-bold">Invoice intake queue</h2>
            <p className="mt-1 text-sm text-muted-foreground">Track incoming and client invoices, budget checks, and approval status.</p>
          </div>

          <div className="flex flex-col gap-4 bg-card p-4 rounded-lg border border-border sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice or vendor..." className="pl-9 bg-background" />
              </div>
              <div className="relative w-full sm:w-auto">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 w-full appearance-none rounded-md border border-input bg-background pl-9 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-ring sm:w-auto"
                >
                  <option value="">All Statuses</option>
                  <option value="Pending">Pending approval</option>
                  <option value="Auto-approved">Auto-approved</option>
                  <option value="Approved">Approved</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
            </div>
            
            {pendingCount > 0 && (
              <div className="flex max-w-full items-center gap-2 self-start rounded-full bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning sm:self-auto">
                <AlertTriangle className="h-4 w-4" />
                {pendingCount} action{pendingCount !== 1 ? 's' : ''} required
              </div>
            )}
          </div>

          <Card className="lg:hidden">
            <CardContent className="space-y-3 p-3">
              {isLoading ? (
                <p className="py-8 text-center text-muted-foreground">Loading invoices...</p>
              ) : invoices.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No invoices found.</p>
              ) : invoices.map((invoice) => (
                <article key={invoice.id} className="min-w-0 rounded-lg border border-border/70 bg-background/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-mono text-sm font-medium">{invoice.invoiceNumber}</p>
                      <p className="mt-1 break-words font-medium text-foreground">{invoice.projectName}</p>
                      {invoice.direction === "luminova_to_client" ? (
                        <div className="mt-2 flex min-w-0 items-center gap-2">
                          <ClientIdentity name={invoice.clientName ?? invoice.vendor} logoUrl={invoice.clientLogoUrl} size="sm" />
                          <div className="min-w-0">
                            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Client invoice</p>
                            <p className="truncate text-xs text-foreground">{invoice.clientName ?? invoice.vendor}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Vendor invoice</p>
                          <p className="break-words text-xs text-muted-foreground">{invoice.vendor}</p>
                        </div>
                      )}
                    </div>
                    <Badge variant={getStatusColor(invoice.status) as any}>{invoice.status}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-y border-border/50 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Date</p>
                      <p className="mt-1 break-words">{formatDate(invoice.date)}</p>
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Amount</p>
                      <p className="mt-1 break-words font-medium tabular-nums">{formatCurrency(invoice.amount)}</p>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Budget line item</p>
                      <p className="mt-1 break-words text-muted-foreground">{invoice.lineItem}</p>
                    </div>
                  </div>
                   <InvoiceDetail invoice={invoice} />
                   {invoice.overage > 0 && (
                     <p className="mt-3 flex min-w-0 items-start gap-1 text-[10px] text-destructive">
                       <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                       <span className="break-words">+{formatCurrency(invoice.overage)} overage</span>
                     </p>
                   )}
                </article>
              ))}
            </CardContent>
          </Card>

          <Card className="hidden lg:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Project & Vendor</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading invoices...</TableCell>
                    </TableRow>
                  ) : invoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No invoices found.</TableCell>
                    </TableRow>
                  ) : invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="max-w-[12rem] break-words font-mono text-sm font-medium">{invoice.invoiceNumber}</TableCell>
                      <TableCell className="min-w-[12rem]">
                        <p className="break-words font-medium text-foreground">{invoice.projectName}</p>
                        {invoice.direction === "luminova_to_client" ? (
                          <div className="mt-2 flex min-w-0 items-center gap-2">
                            <ClientIdentity name={invoice.clientName ?? invoice.vendor} logoUrl={invoice.clientLogoUrl} size="sm" />
                            <div className="min-w-0">
                              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Client invoice</p>
                              <p className="truncate text-xs text-foreground">{invoice.clientName ?? invoice.vendor}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="break-words text-xs text-muted-foreground"><span className="font-mono uppercase tracking-wider">Vendor invoice:</span> {invoice.vendor}</p>
                        )}
                        <p className="mt-1 break-words text-xs text-muted-foreground">Line: {invoice.lineItem}</p>
                        <InvoiceDetail invoice={invoice} />
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(invoice.date)}</TableCell>
                      <TableCell className="text-right">
                        <p className="tabular-nums font-medium">{formatCurrency(invoice.amount)}</p>
                        {invoice.overage > 0 && (
                          <p className="text-[10px] text-destructive flex items-center justify-end gap-1 mt-0.5">
                            <AlertTriangle className="h-3 w-3" /> +{formatCurrency(invoice.overage)} overage
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(invoice.status) as any}>{invoice.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

        </div>
      </div>
    </>
  )
}

function FinancialSummary({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data?: {
    invoicedRevenue: number
    invoicedExpenses: number
    acceptedClientQuoteValue: number
    upcomingClientPayments: number
  }
  isLoading: boolean
  isError: boolean
  onRetry: () => unknown
}) {
  if (isLoading) {
    return (
      <section aria-label="Portfolio financial summary" aria-busy="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="h-36 animate-pulse border-border/60 bg-muted/30" />
        ))}
        <p className="sr-only">Loading portfolio financial totals</p>
      </section>
    )
  }

  if (isError || !data) {
    return (
      <section aria-label="Portfolio financial summary" className="flex flex-col gap-4 border border-destructive/30 bg-destructive/5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold">Financial totals are unavailable</h2>
          <p className="mt-1 text-sm text-muted-foreground">Invoice intake is still available. Retry to load the portfolio overview.</p>
        </div>
        <Button variant="outline" onClick={onRetry} className="gap-2 self-start">
          <RefreshCw className="h-4 w-4" /> Retry totals
        </Button>
      </section>
    )
  }

  const cards = [
    {
      label: "Invoiced revenue",
      value: data.invoicedRevenue,
      detail: "Luminova invoices sent to clients",
      icon: ArrowUpRight,
      accent: "text-success bg-success/10",
    },
    {
      label: "Invoiced expenses",
      value: data.invoicedExpenses,
      detail: "Company invoices received by Luminova",
      icon: ArrowDownRight,
      accent: "text-warning bg-warning/10",
    },
    {
      label: "Total profit",
      value: data.invoicedRevenue - data.invoicedExpenses,
      detail: "Invoiced revenue less invoiced expenses",
      icon: ArrowUpRight,
      accent: data.invoicedRevenue - data.invoicedExpenses >= 0
        ? "text-success bg-success/10"
        : "text-destructive bg-destructive/10",
    },
    {
      label: "Upcoming client payments",
      value: data.upcomingClientPayments,
      detail: `${formatCurrency(data.acceptedClientQuoteValue)} accepted client work`,
      icon: Clock3,
      accent: "text-primary bg-primary/10",
    },
  ]

  return (
    <section aria-label="Portfolio financial summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {cards.map(({ label, value, detail, icon: Icon, accent }) => (
        <Card key={label} className="border-border/60 bg-card/80">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="break-words font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                <p className="mt-3 break-words text-2xl font-extrabold tabular-nums sm:text-3xl">{formatCurrency(value)}</p>
              </div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center ${accent}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-4 break-words border-t border-border/50 pt-3 text-xs text-muted-foreground">{detail}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  )
}
