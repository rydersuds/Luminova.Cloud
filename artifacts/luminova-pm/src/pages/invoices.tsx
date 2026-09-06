import * as React from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { 
  useGetInvoices,
  useCreateInvoice,
  getGetInvoicesQueryKey 
} from "@workspace/api-client-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Filter, FileText, Check, X, AlertTriangle, Search, Plus } from "lucide-react"
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils"
import { useQueryClient } from "@tanstack/react-query"

export default function Invoices() {
  const [statusFilter, setStatusFilter] = React.useState("")
  const [isSubmitOpen, setIsSubmitOpen] = React.useState(false)
  const queryClient = useQueryClient()

  const { data: invoices, isLoading } = useGetInvoices({ 
    status: statusFilter || undefined
  }, {
    query: {
      queryKey: getGetInvoicesQueryKey({ status: statusFilter || undefined })
    }
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
        setIsSubmitOpen(false)
      }
    })
  }

  const pendingCount = invoices?.filter(i => i.status === 'Pending').length || 0

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-background p-6 md:p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-heading font-bold text-foreground">Invoice Intake queue</h1>
              <p className="text-muted-foreground mt-1 text-sm">Review, approve, and track project payables.</p>
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

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border border-border">
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search invoice or vendor..." className="pl-9 bg-background" />
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 pl-9 pr-8 rounded-md bg-background border border-input text-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none"
                >
                  <option value="">All Statuses</option>
                  <option value="Pending">Pending Approval</option>
                  <option value="Approved">Approved</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
            </div>
            
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 text-warning text-sm font-medium bg-warning/10 px-3 py-1.5 rounded-full">
                <AlertTriangle className="h-4 w-4" />
                {pendingCount} action{pendingCount !== 1 ? 's' : ''} required
              </div>
            )}
          </div>

          <Card>
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
                      <TableCell className="font-mono text-sm font-medium">{invoice.invoiceNumber}</TableCell>
                      <TableCell>
                        <p className="font-medium text-foreground">{invoice.projectName}</p>
                        <p className="text-xs text-muted-foreground">{invoice.vendor} • Line: {invoice.lineItem}</p>
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
                      <TableCell className="text-right space-x-2">
                        <Button variant="ghost" size="icon" title="View PDF">
                          <FileText className="h-4 w-4" />
                        </Button>
                        {invoice.status === 'Pending' && (
                          <>
                            <Button variant="ghost" size="icon" className="text-success hover:text-success hover:bg-success/10" title="Approve">
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Reject">
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

        </div>
      </div>
    </AppLayout>
  )
}
