import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getGetDashboardSummaryQueryKey, getGetProjectsQueryKey } from "@workspace/api-client-react"
import { useAuth } from "@clerk/react"
import { CheckCircle2, ChevronDown, ChevronUp, LoaderCircle, UploadCloud, XCircle } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { boundedTextSnippet, cleanupDismissedImportErrors, collectFolderCandidates, forgetDismissedImportError, importFileStorageUnavailableMessage, ImportFileStorageError, pendingDismissedImportStorageKey, rememberDismissedImportError, readBatchImportResponse, wasImportErrorDismissed, type FolderCandidate, type SkippedFolderFile } from "@/lib/project-folder-import"

export type FolderImportStatus = "idle" | "uploading" | "building" | "success" | "error"
type FolderImportProgress = { uploaded: number; failed: number }
type ImportSession = {
  importId: string
  status: "uploading" | "ready" | "building" | "completed" | "failed"
  documents: Array<{ relativePath: string; name: string; size: number; contentType: string }>
  uploadedPaths: string[]
  uploaded: number
  failed: number
  retryable: boolean
  error?: string | null
}
type FolderImportContextValue = {
  folderFiles: FolderCandidate[]
  skippedFolderFiles: SkippedFolderFile[]
  folderStatus: FolderImportStatus
  folderProgress: FolderImportProgress
  folderError: string
  collectFolderFiles: (files: File[]) => void
  startFolderImport: () => Promise<void>
  clearFolderImport: () => void
  dismissFolderError: () => void
  isActive: boolean
}

const ProjectFolderImportContext = React.createContext<FolderImportContextValue | null>(null)
const importFileDatabase = "luminova-folder-imports"

async function withImportFiles<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  let database: IDBDatabase
  try {
    database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(importFileDatabase, 1)
      request.onupgradeneeded = () => request.result.createObjectStore("files")
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } catch {
    throw new ImportFileStorageError()
  }

  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = database.transaction("files", mode)
      const request = run(transaction.objectStore("files"))
      transaction.oncomplete = () => resolve(request?.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } catch {
    throw new ImportFileStorageError()
  } finally {
    database.close()
  }
}

const saveImportFiles = (importId: string, files: FolderCandidate[]) =>
  Promise.all(files.map(({ file, relativePath }) => withImportFiles("readwrite", (store) => store.put(file, `${importId}:${relativePath}`))))

const loadImportFile = (importId: string, relativePath: string) =>
  withImportFiles<File>("readonly", (store) => store.get(`${importId}:${relativePath}`))

const clearImportFiles = (importId: string, paths: string[]) =>
  Promise.all(paths.map((path) => withImportFiles("readwrite", (store) => store.delete(`${importId}:${path}`))))

const scheduleImportFileCleanup = (importId: string, paths: string[]) => {
  void (async () => {
    for (const delay of [0, 250, 1000]) {
      if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay))
      try {
        await clearImportFiles(importId, paths)
        return
      } catch {
        // Cleanup is best-effort after the server has completed the project build.
      }
    }
  })()
}

export function ProjectFolderImportProvider({
  children,
  authState,
}: {
  children: React.ReactNode
  authState?: { isLoaded: boolean; isSignedIn: boolean }
}) {
  const queryClient = useQueryClient()
  const clerkAuth = useAuth()
  const { isLoaded, isSignedIn } = authState ?? clerkAuth
  const [folderFiles, setFolderFiles] = React.useState<FolderCandidate[]>([])
  const [skippedFolderFiles, setSkippedFolderFiles] = React.useState<SkippedFolderFile[]>([])
  const [folderStatus, setFolderStatus] = React.useState<FolderImportStatus>("idle")
  const [folderProgress, setFolderProgress] = React.useState<FolderImportProgress>({ uploaded: 0, failed: 0 })
  const [folderError, setFolderError] = React.useState("")
  const isActive = folderStatus === "uploading" || folderStatus === "building"
  const activeImportRef = React.useRef(false)
  const folderFilesRef = React.useRef<FolderCandidate[]>([])
  const sessionRef = React.useRef<ImportSession | null>(null)
  const dismissedImportIdsRef = React.useRef(new Set<string>())
  const dismissedPendingErrorRef = React.useRef(false)
  const authenticatedFetch = React.useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const send = async (token: string | null) => {
      const headers = new Headers(init.headers)
      if (token) headers.set("Authorization", `Bearer ${token}`)
      return fetch(input, { ...init, headers, credentials: "same-origin" })
    }
    const response = await send(await clerkAuth.getToken())
    if (response.status !== 401) return response
    const refreshedToken = await clerkAuth.getToken({ skipCache: true })
    return refreshedToken ? send(refreshedToken) : response
  }, [clerkAuth.getToken])

  const clearFolderImport = React.useCallback(() => {
    if (activeImportRef.current) return
    folderFilesRef.current = []
    sessionRef.current = null
    setFolderFiles([])
    setSkippedFolderFiles([])
    setFolderProgress({ uploaded: 0, failed: 0 })
    setFolderError("")
    setFolderStatus("idle")
  }, [isActive])

  const dismissFolderError = React.useCallback(() => {
    const importId = sessionRef.current?.importId
    if (importId) {
      dismissedImportIdsRef.current.add(importId)
      rememberDismissedImportError(importId)
      dismissedPendingErrorRef.current = false
      forgetDismissedImportError("__pending__")
    } else {
      dismissedPendingErrorRef.current = true
      rememberDismissedImportError("__pending__")
    }
    clearFolderImport()
  }, [clearFolderImport])

  const collectFolderFiles = React.useCallback((files: File[]) => {
    if (activeImportRef.current) return
    const { accepted, skipped } = collectFolderCandidates(files)
    folderFilesRef.current = accepted
    setFolderFiles(accepted)
    setSkippedFolderFiles(skipped)
    setFolderProgress({ uploaded: 0, failed: 0 })
    setFolderError("")
    setFolderStatus("idle")
    dismissedPendingErrorRef.current = false
    forgetDismissedImportError("__pending__")
  }, [isActive])

  const startFolderImport = React.useCallback(async () => {
    const candidates = [...folderFilesRef.current]
    if (activeImportRef.current || !candidates.length) return
    dismissedPendingErrorRef.current = false
    forgetDismissedImportError("__pending__")
    activeImportRef.current = true
    setFolderStatus("uploading")
    setFolderError("")
    let session = sessionRef.current
    try {
      if (!session) {
        const created = await authenticatedFetch("/api/project-import-sessions", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documents: candidates.map(({ file, relativePath }) => ({
            relativePath, name: file.name, size: file.size, contentType: file.type || "application/octet-stream",
          })) }),
        })
        const body = await readBatchImportResponse<ImportSession>(created, {
          operation: "Creating the import session",
          requestPath: "/api/project-import-sessions",
        })
        session = body
        sessionRef.current = body
        await saveImportFiles(body.importId, candidates)
      }
    } catch (error) {
      const message = error instanceof ImportFileStorageError
        ? importFileStorageUnavailableMessage
        : error instanceof Error ? error.message : "Could not preserve the import session."
      if (error instanceof ImportFileStorageError) sessionRef.current = null
      setFolderStatus("error"); setFolderError(message); activeImportRef.current = false
      return
    }
    const uploadedPaths = new Set(session.uploadedPaths)
    setFolderProgress({ uploaded: uploadedPaths.size, failed: 0 })
    const failures: SkippedFolderFile[] = []
    let cursor = 0
    const uploadOne = async (candidate: FolderCandidate) => {
      if (uploadedPaths.has(candidate.relativePath)) return
      try {
        const request = await authenticatedFetch("/api/storage/uploads/request-url", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: candidate.file.name, size: candidate.file.size, contentType: candidate.file.type || "application/octet-stream", relativePath: candidate.relativePath, importId: session.importId }),
        })
        const signed = await readBatchImportResponse<{ uploadURL?: string; objectPath?: string }>(request, {
          operation: "Requesting an upload URL",
          fileName: candidate.relativePath,
        })
        if (!signed.uploadURL || !signed.objectPath) throw new Error(`Requesting an upload URL for "${candidate.relativePath}" returned incomplete data. Please retry the import.`)
        const put = await fetch(signed.uploadURL, { method: "PUT", headers: { "Content-Type": candidate.file.type || "application/octet-stream" }, body: candidate.file })
        await readBatchImportResponse<void>(put, { operation: "Uploading", fileName: candidate.relativePath, expectsJson: false })
        const attached = await authenticatedFetch(`/api/project-import-sessions/${session.importId}/documents`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ relativePath: candidate.relativePath, objectPath: signed.objectPath, name: candidate.file.name, size: candidate.file.size, contentType: candidate.file.type || "application/octet-stream", textSnippet: await boundedTextSnippet(candidate.file) }),
        })
        const attachedBody = await readBatchImportResponse<ImportSession>(attached, {
          operation: "Saving the completed upload",
          fileName: candidate.relativePath,
        })
        uploadedPaths.add(candidate.relativePath)
        sessionRef.current = attachedBody
        setFolderProgress((current) => ({ ...current, uploaded: current.uploaded + 1 }))
      } catch (error) {
        try {
          const recovery = await authenticatedFetch("/api/project-import-sessions")
          const recovered = await readBatchImportResponse<ImportSession | null>(recovery, { operation: "Checking upload recovery" })
          if (recovered?.importId === session.importId && recovered.uploadedPaths.includes(candidate.relativePath)) {
            uploadedPaths.add(candidate.relativePath)
            sessionRef.current = recovered
            setFolderProgress((current) => ({ ...current, uploaded: current.uploaded + 1 }))
            return
          }
        } catch {
          // Record the original upload error below.
        }
        failures.push({ name: candidate.relativePath, reason: error instanceof Error ? error.message : "Upload failed" })
        setFolderProgress((current) => ({ ...current, failed: current.failed + 1 }))
      }
    }
    const worker = async () => {
      while (cursor < candidates.length) await uploadOne(candidates[cursor++])
    }
    await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, worker))
    setSkippedFolderFiles((current) => [...current, ...failures])
    if (uploadedPaths.size !== session.documents.length) {
      const missing = session.documents.length - uploadedPaths.size
      const message = `${missing} file${missing === 1 ? "" : "s"} still need to be uploaded. Retry only the failed or missing files.`
      setFolderStatus("error"); setFolderError(message)
      activeImportRef.current = false
      toast({ variant: "destructive", title: "Project folder import failed", description: message })
      return
    }
    setFolderStatus("building")
    const finishImport = async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetProjectsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
      ])
      setFolderStatus("success")
      setFolderError("")
      scheduleImportFileCleanup(session.importId, session.documents.map((item) => item.relativePath))
      cleanupDismissedImportErrors(null)
      forgetDismissedImportError("__pending__")
      sessionRef.current = null
      activeImportRef.current = false
      toast({ title: "Project initialized", description: "The folder was uploaded and the project build completed." })
    }
    const reconcileBuild = async (): Promise<
      { state: "completed" } | { state: "retryable" | "terminal"; session: ImportSession } | { state: "unavailable" }
    > => {
      for (let attempt = 0; attempt < 45; attempt++) {
        try {
          const statusResponse = await authenticatedFetch(`/api/project-import-sessions/${session.importId}`)
          const active = await readBatchImportResponse<ImportSession | null>(statusResponse, { operation: "Checking project build status" })
          if (!active) return { state: "completed" }
          if (active.importId !== session.importId) return { state: "unavailable" }
          if (active.status === "completed") return { state: "completed" }
          if (active.status === "failed" || active.status === "uploading" || active.status === "ready") {
            return { state: active.retryable ? "retryable" : "terminal", session: active }
          }
          setFolderStatus("building")
        } catch {
          // Brief proxy and API outages are expected while a long build is running.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000))
      }
      return { state: "unavailable" }
    }

    let buildAttempt = 0
    let buildError: unknown
    while (buildAttempt < 2) {
      try {
        const response = await authenticatedFetch(`/api/project-import-sessions/${session.importId}/build`, { method: "POST" })
        const body = await readBatchImportResponse<{ project?: { id: string } }>(response, { operation: "Building the imported project" })
        if (!body.project) throw new Error("Building the imported project returned incomplete data. Please retry the import.")
        await finishImport()
        return
      } catch (error) {
        buildError = error
        const recovery = await reconcileBuild()
        if (recovery.state === "completed") {
          await finishImport()
          return
        }
        if (recovery.state === "retryable" && buildAttempt === 0) {
          sessionRef.current = recovery.session
          buildAttempt++
          continue
        }
        const message = recovery.state === "terminal"
          ? recovery.session.error || "The project could not be built. Retry when ready."
          : recovery.state === "retryable"
            ? recovery.session.error || "The project build was interrupted again. Retry when ready."
            : buildError instanceof Error
              ? `${buildError.message} Build recovery is temporarily unavailable. Retry to continue from the uploaded files.`
              : "Build recovery is temporarily unavailable. Retry to continue from the uploaded files."
        setFolderStatus("error"); setFolderError(message)
        activeImportRef.current = false
        toast({ variant: "destructive", title: "Project folder import failed", description: message })
        return
      }
    }
  }, [authenticatedFetch, queryClient])

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false
    let poll: number | undefined
    const restore = async () => {
      try {
        let session: ImportSession | null = null
        for (let attempt = 0; attempt < 6; attempt++) {
          try {
            const response = await authenticatedFetch("/api/project-import-sessions")
            session = await readBatchImportResponse<ImportSession | null>(response, { operation: "Restoring the import session" })
            break
          } catch (error) {
            if (attempt === 5) throw error
            await new Promise((resolve) => window.setTimeout(resolve, 500))
          }
        }
        if (cancelled) return
        cleanupDismissedImportErrors(session?.status === "completed" ? null : session?.importId ?? null)
        const pendingDismissed = dismissedPendingErrorRef.current || wasImportErrorDismissed("__pending__")
        if (!session) {
          if (pendingDismissed) return
          return
        }
        if (session.status === "completed") {
          scheduleImportFileCleanup(session.importId, session.documents.map((item) => item.relativePath))
          return
        }
        if (pendingDismissed) {
          dismissedImportIdsRef.current.add(session.importId)
          rememberDismissedImportError(session.importId)
          dismissedPendingErrorRef.current = false
          forgetDismissedImportError("__pending__")
          return
        }
        if (dismissedImportIdsRef.current.has(session.importId) || wasImportErrorDismissed(session.importId)) {
          if (sessionRef.current?.importId === session.importId) clearFolderImport()
          return
        }
        const restored = (await Promise.all(session.documents.map(async (document) => {
          const file = await loadImportFile(session.importId, document.relativePath)
          return file ? { file, relativePath: document.relativePath } : null
        }))).filter((item): item is FolderCandidate => item !== null)
        if (dismissedImportIdsRef.current.has(session.importId) || wasImportErrorDismissed(session.importId)) {
          if (sessionRef.current?.importId === session.importId) clearFolderImport()
          return
        }
        sessionRef.current = session
        folderFilesRef.current = restored
        setFolderFiles(restored)
        setFolderProgress({ uploaded: session.uploaded, failed: Math.max(session.documents.length - session.uploaded - restored.filter((item) => !session.uploadedPaths.includes(item.relativePath)).length, 0) })
        if (session.status === "building") {
          setFolderStatus("building")
          let transientFailures = 0
          let attempts = 0
          const checkBuild = async () => {
            if (cancelled) return
            attempts++
            try {
              const statusResponse = await authenticatedFetch(`/api/project-import-sessions/${session.importId}`)
              const active = await readBatchImportResponse<ImportSession | null>(statusResponse, { operation: "Checking project build status" })
              transientFailures = 0
              if (active?.importId === session.importId && active.status === "building") {
                if (attempts < 45) poll = window.setTimeout(checkBuild, 2000)
                else {
                  setFolderStatus("error")
                  setFolderError("The project build is still unavailable. Retry to continue from the uploaded files.")
                }
                return
              }
              if (active?.importId === session.importId && active.status === "failed") {
                sessionRef.current = active
                if (active.retryable && restored.length) {
                  setFolderStatus("idle")
                  if (!cancelled) await startFolderImport()
                } else {
                  setFolderStatus("error")
                  setFolderError(active.error || "The project could not be built. Retry when ready.")
                }
                return
              }
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: getGetProjectsQueryKey() }),
                queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
              ])
              scheduleImportFileCleanup(session.importId, session.documents.map((item) => item.relativePath))
              sessionRef.current = null
              setFolderStatus("success")
            } catch (error) {
              transientFailures++
              if (attempts < 45 && transientFailures < 6) {
                poll = window.setTimeout(checkBuild, 2000)
              } else if (!cancelled) {
                sessionRef.current = session
                setFolderStatus("error")
                setFolderError(`${error instanceof Error ? error.message : "Checking project build status failed."} Retry to continue from the uploaded files.`)
              }
            }
          }
          poll = window.setTimeout(checkBuild, 2000)
          return
        }
        if (restored.length) {
          setFolderStatus("idle")
          if (!cancelled) await startFolderImport()
        } else {
          setFolderStatus("error")
          setFolderError(session.error || "Select only the missing files to continue this import.")
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ImportFileStorageError) {
            sessionRef.current = null
            folderFilesRef.current = []
            setFolderFiles([])
            setSkippedFolderFiles([])
            setFolderProgress({ uploaded: 0, failed: 0 })
          }
          if (dismissedPendingErrorRef.current || wasImportErrorDismissed("__pending__")) return
          setFolderStatus("error")
          setFolderError(error instanceof ImportFileStorageError
            ? importFileStorageUnavailableMessage
            : error instanceof Error ? error.message : "Restoring the import session failed. Start a new import or retry.")
        }
      }
    }
    void restore()
    return () => {
      cancelled = true
      if (poll !== undefined) window.clearInterval(poll)
    }
  }, [authenticatedFetch, isLoaded, isSignedIn, queryClient, startFolderImport])

  return <ProjectFolderImportContext.Provider value={{ folderFiles, skippedFolderFiles, folderStatus, folderProgress, folderError, collectFolderFiles, startFolderImport, clearFolderImport, dismissFolderError, isActive }}>
    {children}
    <FolderImportActivity isSignedIn={Boolean(isSignedIn)} />
  </ProjectFolderImportContext.Provider>
}

export function useProjectFolderImport() {
  const context = React.useContext(ProjectFolderImportContext)
  if (!context) throw new Error("useProjectFolderImport must be used within ProjectFolderImportProvider")
  return context
}

function FolderImportActivity({ isSignedIn }: { isSignedIn: boolean }) {
  const { folderFiles, skippedFolderFiles, folderStatus, folderProgress, folderError, dismissFolderError } = useProjectFolderImport()
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
      {!active && <button type="button" onClick={dismissFolderError} className="mt-3 w-full rounded-lg border border-primary/25 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-primary transition-colors hover:bg-primary/10">{isError ? "Dismiss error" : "Dismiss status"}</button>}
    </div>}
  </aside>
}
