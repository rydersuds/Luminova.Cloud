import * as React from "react"
import {
  useRequestInvoiceUpload,
  useCreateInvoice,
  type Invoice,
  type InvoiceProject,
} from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertTriangle, FileUp, RefreshCw } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

const MAX_BYTES = 20 * 1024 * 1024
const TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const
type AllowedType = (typeof TYPES)[number]
const NO_BUDGET = "__none__"

type Reservation = { projectId: string; objectPath: string; file: File }

type CreateBody = Parameters<ReturnType<typeof useCreateInvoice>["mutateAsync"]>[0]["data"]

function errMessage(e: unknown): string {
  const anyE = e as { data?: { error?: string; message?: string } | null; message?: string }
  return anyE?.data?.error || anyE?.data?.message || anyE?.message || "Request failed"
}

export function InvoiceUploadForm({
  projects,
  onSubmitted,
  onLockChange,
  initialProjectId = "",
}: {
  projects: InvoiceProject[]
  onSubmitted: (invoice: Invoice) => void
  onLockChange?: (locked: boolean) => void
  initialProjectId?: string
}) {
  const requestUpload = useRequestInvoiceUpload()
  const createInvoice = useCreateInvoice()
  const [projectId, setProjectId] = React.useState(() => projects.some(project => project.id === initialProjectId) ? initialProjectId : "")
  const [categoryId, setCategoryId] = React.useState("")
  const [file, setFile] = React.useState<File | null>(null)
  const [invoiceNumber, setInvoiceNumber] = React.useState("")
  const [vendor, setVendor] = React.useState("")
  const [date, setDate] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [lineItem, setLineItem] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [uncertain, setUncertain] = React.useState(false)
  const [needsReupload, setNeedsReupload] = React.useState(false)
  const inFlight = React.useRef(false)
  const frozen = React.useRef<CreateBody | null>(null)
  const reservation = React.useRef<Reservation | null>(null)
  const submissionId = React.useRef(crypto.randomUUID())
  const locked = busy || uncertain

  const lockCb = React.useRef(onLockChange)
  lockCb.current = onLockChange
  React.useEffect(() => { lockCb.current?.(locked) }, [locked])
  React.useEffect(() => () => lockCb.current?.(false), [])

  const project = projects.find((p) => p.id === projectId)
  const category = project?.categories.find((c) => c.id === categoryId)
  const noBudget = categoryId === NO_BUDGET
  const externalAuthorization = project?.budgetEnabled === false
  const amountNum = Number(amount)

  const onFile = (f: File | null) => {
    if (locked) return
    setError(null)
    setNeedsReupload(false)
    if (f && !(TYPES as readonly string[]).includes(f.type)) {
      setFile(null)
      setError("Upload a PDF, JPEG, PNG, or WebP file.")
      return
    }
    if (f && f.size > MAX_BYTES) {
      setFile(null)
      setError("File is larger than the 20 MB limit.")
      return
    }
    reservation.current = null
    setFile(f)
  }

  const onProject = (id: string) => {
    if (locked) return
    setProjectId(id)
    const selected = projects.find((candidate) => candidate.id === id)
    setCategoryId(selected?.budgetEnabled === false ? NO_BUDGET : "")
    setLineItem("")
    reservation.current = null
  }

  const onCategory = (id: string) => {
    if (locked) return
    setCategoryId(id)
    const c = project?.categories.find((x) => x.id === id)
    setLineItem(c ? `${c.code} ${c.description}`.trim() : "")
  }

  const uploadAgain = () => {
    reservation.current = null
    setNeedsReupload(false)
    setError(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    if (!frozen.current && (!file || !project || !categoryId)) return
    if (!frozen.current && !(amountNum > 0)) { setError("Enter a total greater than zero."); return }
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      if (!frozen.current) {
        // Upload phase: failures here mean no invoice request was sent.
        try {
          let res = reservation.current
          if (!res || res.projectId !== project!.id || res.file !== file) {
            const contentType = file!.type as AllowedType
            const slot = await requestUpload.mutateAsync({
              data: { projectId: project!.id, name: file!.name, size: file!.size, contentType },
            })
            const put = await fetch(slot.uploadURL, {
              method: "PUT",
              body: file!,
              headers: { "Content-Type": contentType },
            })
            if (!put.ok) throw new Error(`File upload failed (${put.status}).`)
            res = { projectId: project!.id, objectPath: slot.objectPath, file: file! }
            reservation.current = res
          }
          frozen.current = {
            invoiceNumber: invoiceNumber.trim(),
            projectId: project!.id,
            vendor: vendor.trim(),
            amount: amountNum,
            date,
            lineItem: lineItem.trim(),
            budgetLineItemId: noBudget ? null : categoryId,
            submissionId: submissionId.current,
            attachment: {
              objectPath: res.objectPath,
              name: file!.name,
              size: file!.size,
              contentType: file!.type as AllowedType,
            },
          }
        } catch (err) {
          reservation.current = null
          setError(`${errMessage(err)} The invoice was not submitted. Check the details and try again.`)
          return
        }
      }
      try {
        const invoice = await createInvoice.mutateAsync({ data: frozen.current })
        frozen.current = null
        reservation.current = null
        submissionId.current = crypto.randomUUID()
        setUncertain(false); setNeedsReupload(false)
        setFile(null); setInvoiceNumber(""); setVendor(""); setDate(""); setAmount("")
        setLineItem(""); setCategoryId("")
        onSubmitted(invoice)
      } catch (err) {
        const status = (err as { status?: number })?.status
        if (status === 400 || status === 403 || status === 404 || status === 409) {
          // Definitive rejection: nothing was saved.
          frozen.current = null
          setUncertain(false)
          if (status === 409) {
            submissionId.current = crypto.randomUUID()
          }
          if (status === 404 || status === 400) setNeedsReupload(true)
          setError(`${errMessage(err)} Nothing was saved. Correct the details and submit again.`)
        } else {
          setUncertain(true)
          setError(`${errMessage(err)} The outcome is uncertain, so the form is locked. Retry the same submission; the identical request will be sent.`)
        }
      }
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const field = "space-y-1.5"
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="form-invoice-upload">
      <fieldset disabled={locked} className="min-w-0 space-y-4 border-0 p-0">
      <div className={field}>
        <Label htmlFor="inv-project">Project</Label>
        <select id="inv-project" required value={projectId} onChange={(e) => onProject(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="select-invoice-project">
          <option value="">Select a project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className={field}>
        <Label htmlFor="inv-category">{externalAuthorization ? "Budget review" : "Trade / budget category"}</Label>
        <select id="inv-category" required disabled={!project} value={categoryId} onChange={(e) => onCategory(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50" data-testid="select-invoice-category">
          <option value="">{externalAuthorization ? "External authorization required" : project ? "Select a category" : "Choose a project first"}</option>
          {project?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} {c.description} — {c.remaining === null ? "no priced budget" : `${formatCurrency(c.remaining)} remaining`}
            </option>
          ))}
          {project && <option value={NO_BUDGET}>{externalAuthorization ? "External authorization required" : "No matching budget category"}</option>}
        </select>
      </div>

      {category && (
        <div className="rounded-lg border border-border/70 bg-muted/40 p-3 text-xs" data-testid="panel-budget-basis">
          <p className="font-mono uppercase tracking-wider text-muted-foreground">Budget basis: remaining in this trade/category (imported baseline plus submitted costs)</p>
          {category.budgeted === null || category.remaining === null ? (
            <p className="mt-1 text-warning">A reliable remaining budget is unavailable for this category. The invoice will be Pending approval (budget unavailable).</p>
          ) : (
            <p className="mt-1">
              Budgeted {formatCurrency(category.budgeted)}, used {formatCurrency(category.used)} (includes pending submissions that reserve budget), remaining {formatCurrency(category.remaining)}.
              {amountNum > 0 && (amountNum <= category.remaining
                ? " This total fits and is expected to be auto-approved."
                : ` This total exceeds the remaining budget by ${formatCurrency(amountNum - category.remaining)}.`)}
            </p>
          )}
          <p className="mt-1 text-muted-foreground">The server makes the final decision when you submit.</p>
        </div>
      )}
      {noBudget && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning" data-testid="text-no-budget">
          {externalAuthorization
            ? "Budget tracking is disabled for this project. The invoice will remain pending; obtain authorization outside the app before proceeding."
            : "With no matching budget, the invoice is saved as Pending approval (budget unavailable). It is never auto-approved."}
        </p>
      )}

      <div className={field}>
        <Label htmlFor="inv-file">Invoice file (PDF, JPEG, PNG, WebP, up to 20 MB)</Label>
        <label htmlFor="inv-file" className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-background p-3 text-sm">
          <FileUp className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0 break-words" data-testid="text-file-name">{file ? `${file.name} (${(file.size / 1048576).toFixed(2)} MB)` : "Choose a file"}</span>
        </label>
        <input id="inv-file" type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)} data-testid="input-invoice-file" />
        <p className="text-[11px] text-muted-foreground">Values are not read from the file. Enter and confirm them below.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={field}>
          <Label htmlFor="inv-number">Invoice number</Label>
          <Input id="inv-number" required maxLength={100} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} data-testid="input-invoice-number" />
        </div>
        <div className={field}>
          <Label htmlFor="inv-date">Invoice date</Label>
          <Input id="inv-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-invoice-date" />
        </div>
        <div className={field}>
          <Label htmlFor="inv-vendor">Vendor</Label>
          <Input id="inv-vendor" required maxLength={200} value={vendor} onChange={(e) => setVendor(e.target.value)} data-testid="input-invoice-vendor" />
        </div>
        <div className={field}>
          <Label htmlFor="inv-amount">Total ($)</Label>
          <Input id="inv-amount" type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="input-invoice-amount" />
        </div>
      </div>
      <div className={field}>
        <Label htmlFor="inv-line">{noBudget ? "Line item description (typed)" : "Line item"}</Label>
        <Input id="inv-line" required maxLength={300} value={lineItem} onChange={(e) => setLineItem(e.target.value)} data-testid="input-invoice-line-item" />
      </div>

      </fieldset>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" data-testid="text-invoice-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || (!uncertain && (!file || !project || !categoryId))} className="gap-2" data-testid="button-submit-invoice">
          {uncertain && <RefreshCw className="h-4 w-4" />}
          {busy ? "Submitting..." : uncertain ? "Retry same submission" : "Submit invoice"}
        </Button>
        {needsReupload && !locked && (
          <Button type="button" variant="outline" onClick={uploadAgain} data-testid="button-upload-again">Upload file again</Button>
        )}
      </div>
    </form>
  )
}
