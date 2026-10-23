import * as React from "react"
import { cancelQuoteUpload, extractQuoteDraft, requestQuoteUpload, uploadQuoteContent, type QuoteDraft } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { FileUp } from "lucide-react"

export const QUOTE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
export const QUOTE_LIMITS = "One PDF up to 15 MB, or JPEG, PNG, WebP up to 8 MB."
export function quoteFileError(file: File) {
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Choose a PDF, JPEG, PNG, or WebP."
  if (file.size <= 0 || file.size > (file.type === "application/pdf" ? 15 : 8) * 1024 * 1024) return QUOTE_LIMITS
  return null
}
export function quoteError(error: unknown) {
  const e = error as { data?: { error?: string }; message?: string }
  return e.data?.error || e.message || "Request failed. Please retry."
}

export function QuoteDocumentUpload({ projectId, initialFile, disabled, onSource, onDraft, onBusy, onSelected, editVersion }: {
  projectId: string; initialFile?: File | null; disabled: boolean
  onSource: (id: string | null) => void
  onDraft: (draft: QuoteDraft, version: number) => void
  onBusy: (busy: boolean) => void
  onSelected: (selected: boolean) => void
  editVersion: React.MutableRefObject<number>
}) {
  const [file, setFile] = React.useState<File | null>(initialFile ?? null)
  const [stage, setStage] = React.useState<"idle" | "uploading" | "analyzing">("idle")
  const [error, setError] = React.useState("")
  const [slotId, setSlotId] = React.useState<string | null>(null)
  const epoch = React.useRef(0)
  const slot = React.useRef<string | null>(null)
  const picker = React.useRef<HTMLInputElement>(null)
  const callbacks = React.useRef({ onSource, onDraft, onBusy })
  callbacks.current = { onSource, onDraft, onBusy }
  const release = (id: string | null) => {
    if (id) void cancelQuoteUpload(id).catch(() => { /* Expiration cleanup retries inaccessible/failed cancellations. */ })
  }
  React.useEffect(() => {
    ++epoch.current
    release(slot.current); slot.current = null; setSlotId(null)
    callbacks.current.onSource(null); setStage("idle"); callbacks.current.onBusy(false)
    setError("")
  }, [projectId])
  // Parent unmounts only after a confirmed save or explicit cancellation.
  React.useEffect(() => () => {
    ++epoch.current
    release(slot.current)
    callbacks.current.onBusy(false)
  }, [])
  // Attached uploads reject cancellation on the server, so this cleanup is safe even
  // after a response-lost save. No client path can delete a claimed original.

  const choose = (files: FileList | File[]) => {
    if (disabled) return
    if (files.length !== 1) { setError("Choose one document at a time."); return }
    const next = files[0]
    const validation = quoteFileError(next)
    if (validation) { setError(validation); return }
    ++epoch.current
    release(slot.current); slot.current = null; setSlotId(null)
    callbacks.current.onSource(null); callbacks.current.onBusy(false)
    setStage("idle"); setFile(next); setError("")
    onSelected(true)
  }
  const analyze = async () => {
    if (!file || !projectId || disabled || stage !== "idle") return
    const run = ++epoch.current
    const version = editVersion.current
    const active = () => epoch.current === run
    let uploaded = !!slotId
    callbacks.current.onBusy(true); setError("")
    try {
      let id = slot.current
      if (!id) {
        setStage("uploading")
        const result = await requestQuoteUpload({ projectId, name: file.name, size: file.size, contentType: file.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp" })
        if (!active()) { release(result.id); return }
        id = result.id; slot.current = id
        await uploadQuoteContent(id, file)
        if (!active()) return
        uploaded = true
        setSlotId(id); callbacks.current.onSource(id)
      }
      setStage("analyzing")
      const draft = await extractQuoteDraft(id)
      if (active()) callbacks.current.onDraft(draft, version)
    } catch (error) {
      if (active()) {
        setError(`${quoteError(error)} You can continue entering the quote manually.`)
        // An uploaded source survives analysis failures. Failed content upload needs
        // a fresh reservation, rather than attempting to rewrite immutable bytes.
        if (!uploaded) {
          release(slot.current); slot.current = null; setSlotId(null)
          callbacks.current.onSource(null)
        }
      }
    } finally {
      if (active()) { setStage("idle"); callbacks.current.onBusy(false) }
    }
  }
  return <section aria-label="Quote document upload" className="space-y-3 rounded-md border border-border p-4">
    <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); choose(e.dataTransfer.files) }}
      className="space-y-2 border border-dashed border-primary/50 bg-primary/5 p-4 text-center">
      <FileUp aria-hidden className="mx-auto h-6 w-6 text-primary" />
      <p className="text-sm font-medium">{file ? file.name : "Drop a vendor quote here"}</p>
      <p className="text-xs text-muted-foreground">{QUOTE_LIMITS}</p>
      <input ref={picker} type="file" aria-label="Choose vendor quote document" accept={QUOTE_ACCEPT} disabled={disabled}
        className="sr-only" onChange={e => { if (e.target.files?.length) choose(e.target.files); e.target.value = "" }} />
      <Button type="button" variant="outline" disabled={disabled} onClick={() => picker.current?.click()}>{file ? "Replace document" : "Choose document"}</Button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" disabled={!file || !projectId || disabled || stage !== "idle"} onClick={analyze}>
        {stage === "uploading" ? "Uploading…" : stage === "analyzing" ? "Analyzing…" : slotId ? "Retry analysis" : "Upload and analyze"}
      </Button>
      {file && <Button type="button" variant="ghost" disabled={disabled} onClick={() => {
        ++epoch.current; release(slot.current); slot.current = null; setSlotId(null); setFile(null); setStage("idle")
        callbacks.current.onSource(null); callbacks.current.onBusy(false); setError("")
        onSelected(false)
      }}>Remove document</Button>}
    </div>
    {!projectId && <p className="text-sm text-muted-foreground">Select a project before uploading.</p>}
    {slotId && <p className="text-xs text-muted-foreground">Private source uploaded. It will attach only when you save. Unsaved uploads expire after 24 hours.</p>}
    <p role="status" aria-live="polite" className="text-sm">{stage === "uploading" ? "Uploading your private document…" : stage === "analyzing" ? "Reading quote suggestions. You can edit below while analysis runs." : ""}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
