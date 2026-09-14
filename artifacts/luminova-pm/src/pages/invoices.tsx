import * as React from "react"
import { 
  useGetInvoices,
  useCreateInvoice,
  getGetInvoicesQueryKey,
  useGetFinancialSummary,
  getGetFinancialSummaryQueryKey,
} from "@workspace/api-client-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Filter, FileText, Check, X, AlertTriangle, Search, Plus, ArrowUpRight, ArrowDownRight, Clock3, RefreshCw } from "lucide-react"
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import { ClientIdentity } from "@/components/client-identity"

export default function Invoices() {
  const [statusFilter, setStatusFilter] = React.useState("")
  const [search, setSearch] = React.useState(() => new URLSearchParams(window.location.search).get("search") ?? "")
  const [isSubmitOpen, setIsSubmitOpen] = React.useState(false)
  const queryClient = useQueryClient()

  const { data: invoices, isLoading } = useGetInvoices({ 
    status: statusFilter || undefined,
    search: search || undefined,
  }, {
    query: {
      queryKey: getGetInvoicesQueryKey({ status: statusFilter || undefined, search: search || undefined })
    }
  })
  const financialSummary = useGetFinancialSummary({
    query: { queryKey: getGetFinancialSummaryQueryKey(), retry: false },
  })

  const createInvoice = useCreateInvoice()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    createInvoice.mutate({
      data: {
        invoiceNumber: formData.get("invoiceNumber") as string,
        projectId: formData.get("projectId") as string,
        vendor: formData.get("vendor") as string,
        amount: Number(formData.get("amount")),
        date: formData.get("date") as string,
        lineItem: formData.get("lineItem") as string,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetInvoicesQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetFinancialSummaryQueryKey() })
        setIsSubmitOpen(false)
      }
    })
  }

  const pendingCount = invoices?.filter(i => i.status === 'Pending').length || 0

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
              <h1 className="text-3xl font-heading font-bold text-foreground">Financial Overview</h1>
              <p className="text-muted-foreground mt-1 text-sm">Track client revenue, project expenses, and accepted work still available to invoice.</p>
            </div>
            
            <Dialog open={isSubmitOpen} onOpenChange={setIsSubmitOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Submit Invoice
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Submit New Invoice</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="invoiceNumber">Invoice Number</Label>
                      <Input id="invoiceNumber" name="invoiceNumber" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date">Date</Label>
                      <Input id="date" name="date" type="date" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vendor">Vendor / Trade</Label>
                    <Input id="vendor" name="vendor" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="projectId">Project ID</Label>
                      <Input id="projectId" name="projectId" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lineItem">Budget Line Item</Label>
                      <Input id="lineItem" name="lineItem" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount ($)</Label>
                    <Input id="amount" name="amount" type="number" step="0.01" required />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={createInvoice.isPending}>
                      {createInvoice.isPending ? "Submitting..." : "Submit"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <FinancialSummary
            data={financialSummary.data}
            isLoading={financialSummary.isLoading}
            isError={financialSummary.isError}
            onRetry={() => financialSummary.refetch()}
          />

          <div className="border-t border-border/60 pt-2">
            <h2 className="text-xl font-heading font-bold">Invoice intake queue</h2>
            <p className="mt-1 text-sm text-muted-foreground">Review, approve, and track incoming and client invoices.</p>
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
                  <option value="Pending">Pending Approval</option>
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
              ) : invoices?.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No invoices found.</p>
              ) : invoices?.map((invoice) => (
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
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {invoice.overage > 0 ? (
                      <p className="flex min-w-0 items-start gap-1 text-[10px] text-destructive">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="break-words">+{formatCurrency(invoice.overage)} overage</span>
                      </p>
                    ) : <span />}
                    <InvoiceActions status={invoice.status} />
                  </div>
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
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading invoices...</TableCell>
                    </TableRow>
                  ) : invoices?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No invoices found.</TableCell>
                    </TableRow>
                  ) : invoices?.map((invoice) => (
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
                      <TableCell className="min-w-[8rem] text-right">
                        <InvoiceActions status={invoice.status} />
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

function InvoiceActions({ status }: { status: string }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button variant="ghost" size="icon" title="View PDF" aria-label="View PDF">
        <FileText className="h-4 w-4" />
      </Button>
      {status === 'Pending' && (
        <>
          <Button variant="ghost" size="icon" className="text-success hover:bg-success/10 hover:text-success" title="Approve" aria-label="Approve invoice">
            <Check className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" title="Reject" aria-label="Reject invoice">
            <X className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
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
