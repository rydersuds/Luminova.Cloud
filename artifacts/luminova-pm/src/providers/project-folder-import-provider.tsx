import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getGetDashboardSummaryQueryKey, getGetProjectsQueryKey } from "@workspace/api-client-react"
import { useAuth } from "@clerk/react"
import { CheckCircle2, ChevronDown, ChevronUp, LoaderCircle, UploadCloud, XCircle } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { boundedTextSnippet, folderFileIssue, normalizeRelativePath, type FolderCandidate, type SkippedFolderFile } from "@/lib/project-folder-import"

export type FolderImportStatus = "idle" | "uploading" | "building" | "success" | "error"
type FolderImportProgress = { uploaded: number; failed: number }
type FolderImportContextValue = {
  folderFiles: FolderCandidate[]
  skippedFolderFiles: SkippedFolderFile[]
  folderStatus: FolderImportStatus
  folderProgress: FolderImportProgress
  folderError: string
  collectFolderFiles: (files: File[]) => void
  startFolderImport: () => Promise<void>
  clearFolderImport: () => void
  isActive: boolean
}

const ProjectFolderImportContext = React.createContext<FolderImportContextValue | null>(null)

export function ProjectFolderImportProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [folderFiles, setFolderFiles] = React.useState<FolderCandidate[]>([])
  const [skippedFolderFiles, setSkippedFolderFiles] = React.useState<SkippedFolderFile[]>([])
  const [folderStatus, setFolderStatus] = React.useState<FolderImportStatus>("idle")
  const [folderProgress, setFolderProgress] = React.useState<FolderImportProgress>({ uploaded: 0, failed: 0 })
  const [folderError, setFolderError] = React.useState("")
  const isActive = folderStatus === "uploading" || folderStatus === "building"
  const activeImportRef = React.useRef(false)
  const folderFilesRef = React.useRef<FolderCandidate[]>([])

  const clearFolderImport = React.useCallback(() => {
    if (activeImportRef.current) return
    folderFilesRef.current = []
    setFolderFiles([])
    setSkippedFolderFiles([])
    setFolderProgress({ uploaded: 0, failed: 0 })
    setFolderError("")
    setFolderStatus("idle")
  }, [isActive])

  const collectFolderFiles = React.useCallback((files: File[]) => {
    if (activeImportRef.current) return
    const seen = new Set<string>()
    const accepted: FolderCandidate[] = []
    const skipped: SkippedFolderFile[] = []
    files.forEach((file) => {
      const rawPath = file.webkitRelativePath || file.name
      const relativePath = normalizeRelativePath(rawPath)
      const issue = relativePath ? folderFileIssue(file, relativePath) : "Unsafe relative path"
      if (!relativePath || issue) skipped.push({ name: rawPath, reason: issue || "Unsafe relative path" })
      else if (seen.has(relativePath.toLocaleLowerCase())) skipped.push({ name: rawPath, reason: "Collides with another relative path" })
      else {
        seen.add(relativePath.toLocaleLowerCase())
        accepted.push({ file, relativePath })
      }
    })
    folderFilesRef.current = accepted
    setFolderFiles(accepted)
    setSkippedFolderFiles(skipped)
    setFolderProgress({ uploaded: 0, failed: 0 })
    setFolderError("")
    setFolderStatus("idle")
  }, [isActive])

  const startFolderImport = React.useCallback(async () => {
    const candidates = [...folderFilesRef.current]
    if (activeImportRef.current || !candidates.length) return
    activeImportRef.current = true
    // Keep the File objects and paths used by this job stable if the dashboard unmounts.
    setFolderStatus("uploading")
    setFolderError("")
    setFolderProgress({ uploaded: 0, failed: 0 })
    const uploaded: Array<{ relativePath: string; objectPath: string; name: string; size: number; contentType: string; textSnippet?: string }> = []
    const failures: SkippedFolderFile[] = []
    let cursor = 0
    const uploadOne = async (candidate: FolderCandidate) => {
      try {
        const request = await fetch("/api/storage/uploads/request-url", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: candidate.file.name, size: candidate.file.size, contentType: candidate.file.type || "application/octet-stream", relativePath: candidate.relativePath }),
        })
        const signed = await request.json() as { uploadURL?: string; objectPath?: string; error?: string }
        if (!request.ok || !signed.uploadURL || !signed.objectPath) throw new Error(signed.error || "Could not start upload")
        const put = await fetch(signed.uploadURL, { method: "PUT", headers: { "Content-Type": candidate.file.type || "application/octet-stream" }, body: candidate.file })
        if (!put.ok) throw new Error("Storage upload failed")
        uploaded.push({ relativePath: candidate.relativePath, objectPath: signed.objectPath, name: candidate.file.name, size: candidate.file.size, contentType: candidate.file.type || "application/octet-stream", textSnippet: await boundedTextSnippet(candidate.file) })
        setFolderProgress((current) => ({ ...current, uploaded: current.uploaded + 1 }))
      } catch (error) {
        failures.push({ name: candidate.relativePath, reason: error instanceof Error ? error.message : "Upload failed" })
        setFolderProgress((current) => ({ ...current, failed: current.failed + 1 }))
      }
    }
    const worker = async () => {
      while (cursor < candidates.length) await uploadOne(candidates[cursor++])
    }
    await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, worker))
    setSkippedFolderFiles((current) => [...current, ...failures])
    if (!uploaded.length) {
      const message = "No supported files could be uploaded. Review the per-file results and try again."
      setFolderStatus("error"); setFolderError(message)
      activeImportRef.current = false
      toast({ variant: "destructive", title: "Project folder import failed", description: message })
      return
    }
    setFolderStatus("building")
    try {
      let remainingSnippetCharacters = 250_000
      const documents = uploaded.map((document) => {
        if (!document.textSnippet || remainingSnippetCharacters <= 0) return { ...document, textSnippet: undefined }
        const textSnippet = document.textSnippet.slice(0, remainingSnippetCharacters)
        remainingSnippetCharacters -= textSnippet.length
        return { ...document, textSnippet }
      })
      const response = await fetch("/api/project-imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documents }) })
      const body = await response.json() as { project?: { id: string }; error?: string }
      if (!response.ok || !body.project) throw new Error(body.error || "The project could not be built")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetProjectsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
      ])
      setFolderStatus("success")
      activeImportRef.current = false
      toast({ title: "Project initialized", description: "The folder was uploaded and the project build completed." })
    } catch (error) {
      const message = error instanceof Error ? error.message : "The uploaded documents could not be analyzed."
      setFolderStatus("error"); setFolderError(message)
      activeImportRef.current = false
      toast({ variant: "destructive", title: "Project folder import failed", description: message })
    }
  }, [queryClient])

  return <ProjectFolderImportContext.Provider value={{ folderFiles, skippedFolderFiles, folderStatus, folderProgress, folderError, collectFolderFiles, startFolderImport, clearFolderImport, isActive }}>
    {children}
    <FolderImportActivity />
  </ProjectFolderImportContext.Provider>
}

export function useProjectFolderImport() {
  const context = React.useContext(ProjectFolderImportContext)
  if (!context) throw new Error("useProjectFolderImport must be used within ProjectFolderImportProvider")
  return context
}

function FolderImportActivity() {
  const { isSignedIn } = useAuth()
  const { folderFiles, skippedFolderFiles, folderStatus, folderProgress, folderError, clearFolderImport } = useProjectFolderImport()
  const [expanded, setExpanded] = React.useState(true)
  if (!isSignedIn || folderStatus === "idle") return null
  const active = folderStatus === "uploading" || folderStatus === "building"
  const isError = folderStatus === "error"
  const label = folderStatus === "uploading" ? "Uploading project folder" : folderStatus === "building" ? "Building project" : isError ? "Project folder import failed" : "Project folder import complete"
  const processed = folderProgress.uploaded + folderProgress.failed
  const remaining = Math.max(folderFiles.length - processed, 0)
  const percent = folderStatus === "building" || folderStatus === "success"
    ? 100
    : Math.round((processed / Math.max(folderFiles.length, 1)) * 100)

  return <aside aria-live="polite" aria-label="Project folder import activity" className="fixed bottom-4 left-4 right-4 z-50 overflow-hidden rounded-2xl border border-primary/35 bg-sidebar/95 text-sidebar-foreground shadow-[0_12px_45px_rgba(0,0,0,.65),0_0_30px_rgba(181,156,63,.12)] backdrop-blur-xl sm:left-auto sm:w-[390px]">
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
        {active ? <LoaderCircle className="h-4 w-4 animate-spin text-primary" aria-hidden="true" /> : isError ? <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest">{label}</p>
          <span className="font-mono text-xs font-bold text-primary">{percent}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded-lg p-1.5 text-sidebar-foreground/65 transition-colors hover:bg-white/5 hover:text-primary" aria-expanded={expanded} aria-label={expanded ? "Hide upload details" : "Show upload details"}>
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
    </div>
    {expanded && <div className="border-t border-white/10 bg-black/15 px-4 py-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white/[.04] px-2 py-2"><strong className="block font-mono text-sm text-primary">{folderProgress.uploaded}</strong><span className="text-[9px] uppercase tracking-wider text-sidebar-foreground/55">Uploaded</span></div>
        <div className="rounded-lg bg-white/[.04] px-2 py-2"><strong className="block font-mono text-sm">{remaining}</strong><span className="text-[9px] uppercase tracking-wider text-sidebar-foreground/55">Remaining</span></div>
        <div className="rounded-lg bg-white/[.04] px-2 py-2"><strong className="block font-mono text-sm text-destructive">{folderProgress.failed}</strong><span className="text-[9px] uppercase tracking-wider text-sidebar-foreground/55">Failed</span></div>
      </div>
      <p className="mt-2 flex items-center gap-2 text-[11px] text-sidebar-foreground/60">
        <UploadCloud className="h-3.5 w-3.5 shrink-0 text-primary" />
        {folderStatus === "building" ? "Uploads complete. Reading documents and creating the project." : `${folderFiles.length} supported files · ${skippedFolderFiles.length} skipped`}
      </p>
      {folderError && <p role="alert" className="mt-2 text-xs text-destructive">{folderError}</p>}
      {!active && <button type="button" onClick={clearFolderImport} className="mt-3 w-full rounded-lg border border-primary/25 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-primary transition-colors hover:bg-primary/10">Dismiss status</button>}
    </div>}
  </aside>
}