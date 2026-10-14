import * as React from "react"
import {
  useGetDashboardSummary,
  useGetProjects,
  useCreateProject,
  useGetCurrentWorkspaceUser,
  useGetProjectManagers,
  useGetFinancialSummary,
  getGetProjectManagersQueryKey,
  getGetProjectsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetFinancialSummaryQueryKey,
} from "@workspace/api-client-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus, Building, Activity, DollarSign, Clock, FileJson, FileSpreadsheet, X, CheckCircle2, AlertTriangle, ShieldAlert, FolderUp, FileText } from "lucide-react"
import { Link, useLocation } from "wouter"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useQueryClient } from "@tanstack/react-query"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useProjectFolderImport } from "@/providers/project-folder-import-provider"
import { GlobalSearch } from "@/components/global-search"
import { ClientIdentity } from "@/components/client-identity"
import { ProjectCard } from "@/components/workspace/project-card"
import { ProjectStage } from "@/components/workspace/project-stage"
import { FinancialFiguresGrid } from "@/components/financial-figures-grid"

// Strict validation schema, zero defaults
const projectSchema = z.object({
  name: z.string().min(1, "Required"),
  address: z.string().min(1, "Required"),
  region: z.string().min(1, "Required"),
  status: z.string().min(1, "Required"),
  projectManagerId: z.string().min(1, "Select a Project Manager"),
  pmName: z.string().optional(),
  clientName: z.string().min(1, "Required"),
  startDate: z.string().min(1, "Required"),
  targetDate: z.string().min(1, "Required"),
  budgeted: z.coerce.number().min(0.01, "Invalid budget"),
  description: z.string().min(1, "Required"),
  exteriorImage: z.string().optional()
})

type ProjectFormValues = z.infer<typeof projectSchema>

// Basic robust CSV parser since papaparse isn't guaranteed
const parseCSV = (text: string) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, ''))
    const obj: Record<string, any> = {}
    headers.forEach((h, i) => {
      obj[h] = values[i] || ''
    })
    return obj
  })
}

export default function Dashboard() {
  const [, setLocation] = useLocation()
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const queryClient = useQueryClient()
  const { data: currentUser } = useGetCurrentWorkspaceUser()
  const isAdmin = currentUser?.role === "Admin"
  const { data: projectManagers, isLoading: loadingProjectManagers, isError: projectManagersError } = useGetProjectManagers({
    query: { enabled: isAdmin, queryKey: getGetProjectManagersQueryKey() },
  })
  
  const dashboardSummary = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey(), retry: false, refetchInterval: 60_000 }
  })
  const summary = dashboardSummary.isError ? undefined : dashboardSummary.data
  const loadingSummary = dashboardSummary.isLoading
  const financialSummary = useGetFinancialSummary({
    query: { queryKey: getGetFinancialSummaryQueryKey(), retry: false, refetchInterval: 60_000 }
  })
  
  const projectQuery = useGetProjects(
    {},
    { query: { queryKey: getGetProjectsQueryKey({}), refetchInterval: 60_000 } }
  )
  const projects = projectQuery.isError ? undefined : projectQuery.data
  const loadingProjects = projectQuery.isLoading

  const createProject = useCreateProject()
  const { folderFiles, skippedFolderFiles, folderStatus, folderProgress, folderError, collectFolderFiles, startFolderImport, clearFolderImport, isActive: isFolderImportActive } = useProjectFolderImport()

  // Intake State
  const [intakeMode, setIntakeMode] = React.useState<"manual" | "import">("manual")
  
  // Manual Form
  const { register, handleSubmit, formState: { errors }, reset: resetManualForm } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
       name: "", address: "", region: "", status: "", projectManagerId: "",
      clientName: "", startDate: "", targetDate: "", description: "", exteriorImage: ""
    } // strictly empty to enforce manual selection
  })

  const onSubmitManual = (data: ProjectFormValues) => {
    createProject.mutate({
      data: {
        ...data,
        budgeted: Math.round(data.budgeted * 100) // dollars to integer cents
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectsQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })
        setIsCreateOpen(false)
        resetManualForm()
      }
    })
  }

  // Import State
  const [dragActive, setDragActive] = React.useState(false)
  const [folderDropError, setFolderDropError] = React.useState("")
  const [parsedRows, setParsedRows] = React.useState<any[]>([])
  const [importStatus, setImportStatus] = React.useState<"idle" | "processing" | "success">("idle")
  const folderInputRef = React.useRef<HTMLInputElement>(null)
  const readDroppedEntries = async (items: DataTransferItemList): Promise<File[]> => {
    const output: File[] = []
    const visit = async (entry: any, prefix = ""): Promise<void> => {
      if (entry.isFile) {
        await new Promise<void>((resolve, reject) => entry.file((file: File) => {
          Object.defineProperty(file, "webkitRelativePath", { value: `${prefix}${file.name}` })
          output.push(file)
          resolve()
        }, reject))
      } else if (entry.isDirectory) {
        const reader = entry.createReader()
        const entries: any[] = []
        let batch: any[]
        do {
          batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))
          entries.push(...batch)
        } while (batch.length)
        await Promise.all(entries.map((child) => visit(child, `${prefix}${entry.name}/`)))
      }
    }
    await Promise.all(Array.from(items).map((item) => {
      const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => any }).webkitGetAsEntry?.()
      return entry ? visit(entry) : Promise.resolve()
    }))
    return output
  }

  const handleFolderDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    setDragActive(false)
    setFolderDropError("")
    // Capture the fallback while the browser still exposes the drop payload.
    const fallbackFiles = Array.from(event.dataTransfer.files)
    try {
      const files = await readDroppedEntries(event.dataTransfer.items)
      const selectedFiles = files.length ? files : fallbackFiles
      if (!selectedFiles.length) {
        setFolderDropError("No readable files were found. Choose the project folder again and retry.")
        return
      }
      collectFolderFiles(selectedFiles)
      void startFolderImport()
    } catch {
      setFolderDropError("The dropped file or folder could not be read. It may have moved or become unavailable. Choose it again and retry.")
    }
  }

  const handleFile = async (file: File) => {
    try {
      const text = await file.text()
      let data: any[] = []
      if (file.name.endsWith('.json')) {
        data = JSON.parse(text)
        if (!Array.isArray(data)) data = [data]
      } else if (file.name.endsWith('.csv')) {
        data = parseCSV(text)
      }

      const results = data.map((row, i) => {
        const managerHint = typeof row.projectManagerId === "string" && row.projectManagerId
          ? row.projectManagerId
          : typeof row.pmName === "string" ? row.pmName.trim().toLowerCase() : ""
        const matchedManager = projectManagers?.find((manager) =>
          manager.id === managerHint ||
          manager.name.toLowerCase() === managerHint ||
          manager.email.toLowerCase() === managerHint,
        )
        const res = projectSchema.safeParse({
          ...row,
          projectManagerId: matchedManager?.id ?? "",
        })
        return { 
          row: i + 1, 
          original: row, 
          valid: res.success, 
          errors: res.success ? null : res.error.errors, 
          data: res.success ? res.data : null 
        }
      })
      setParsedRows(results)
      setImportStatus("idle")
    } catch (e) {
      console.error("Parse error", e)
      setParsedRows([])
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleImportSubmit = async () => {
    setImportStatus("processing")
    const validRows = parsedRows.filter(r => r.valid)
    
    for (const row of validRows) {
      const { pmName: _legacyPmName, ...projectData } = row.data
      await createProject.mutateAsync({
        data: {
           ...projectData,
           budgeted: Math.round(row.data.budgeted * 100) // Convert dollars to cents
        }
      })
    }
    
    setImportStatus("success")
    queryClient.invalidateQueries({ queryKey: getGetProjectsQueryKey() })
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })
    setTimeout(() => {
      setIsCreateOpen(false)
      setParsedRows([])
      setImportStatus("idle")
    }, 1500)
  }

  const validCount = parsedRows.filter(r => r.valid).length
  const invalidCount = parsedRows.filter(r => !r.valid).length
  const financials = financialSummary.isError ? undefined : financialSummary.data
  const finiteAmount = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined
  const revenue = finiteAmount(financials?.invoicedRevenue)
  const expenses = finiteAmount(financials?.invoicedExpenses)
  const recordedMargin = revenue !== undefined && expenses !== undefined ? revenue - expenses : undefined
  const financialCards = [
    {
      label: "Invoiced Revenue",
      description: "Client invoices issued; not payments received.",
      value: revenue,
      icon: FileText,
      accent: "text-success bg-success/10",
      loading: financialSummary.isLoading,
    },
    {
      label: "Recorded Internal Costs",
      description: "Vendor invoices or imported internal actuals, without double-counting.",
      value: expenses,
      icon: Activity,
      accent: "text-warning bg-warning/10",
      loading: financialSummary.isLoading,
    },
    {
      label: "Recorded Margin",
      description: "Invoiced revenue minus recorded internal costs; not cash profit.",
      value: recordedMargin,
      icon: DollarSign,
      accent: (recordedMargin ?? 0) >= 0 ? "text-success bg-success/10" : "text-destructive bg-destructive/10",
      loading: financialSummary.isLoading,
    },
    {
      label: "Internal Cost Budget",
      description: "Allocated internal budgets across your visible projects.",
      value: finiteAmount(summary?.budgeted),
      icon: DollarSign,
      accent: "text-info bg-info/10",
      loading: loadingSummary,
    },
    {
      label: "Client Quote Value",
      description: "Accepted client quotes, with imported project quote totals as fallback.",
      value: finiteAmount(financials?.acceptedClientQuoteValue),
      icon: CheckCircle2,
      accent: "text-info bg-info/10",
      loading: financialSummary.isLoading,
    },
    {
      label: "Unbilled Client Work",
      description: "Client quote value not yet invoiced, floored at zero per project.",
      value: finiteAmount(financials?.upcomingClientPayments),
      icon: Clock,
      accent: "text-primary bg-primary/10",
      loading: financialSummary.isLoading,
    },
  ]

  return (
    <>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-transparent pb-12">
        <div className="p-4 sm:p-6 md:p-8 max-w-[1600px] mx-auto space-y-8">
          
          {/* Header */}
          <div className="hud-header hud-frame flex flex-col gap-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-4"><span className="hud-kicker">Global overview</span></div>
              <h1 className="text-4xl sm:text-5xl font-heading font-extrabold text-foreground tracking-[-0.03em]">Command Center</h1>
            </div>
            
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full sm:w-auto gap-2 btn-3d font-bold tracking-wide shadow-xl bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-5 sm:px-6">
                    <Plus className="h-4 w-4 drop-shadow-sm" />
                    <span className="sm:hidden drop-shadow-sm">NEW PROJECT</span>
                    <span className="hidden sm:inline drop-shadow-sm">INITIALIZE PROJECT</span>
                  </Button>
                </DialogTrigger>
                 <DialogContent className="!fixed top-[50dvh] translate-y-[-50%] max-w-4xl w-[calc(100%-1rem)] max-h-[calc(100dvh-2rem)] overflow-hidden surface-3d p-0 border-border/50 flex flex-col">
                   <div className="shrink-0 p-6 pr-12 border-b border-border/50 bg-black/20 flex justify-between items-center shadow-[inset_0_-1px_3px_rgba(0,0,0,0.2)]">
                    <div>
                      <DialogTitle className="text-2xl font-heading tracking-tight flex items-center gap-2">
                        <Building className="h-6 w-6 text-primary" />
                        Initialize New Project
                      </DialogTitle>
                      <p className="text-sm text-muted-foreground mt-1 font-mono">Establish secure project telemetry parameters.</p>
                    </div>
                  </div>

                   <div data-testid="project-initialization-scroll-area" className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-background/40">
                     <div className="sticky top-0 z-10 flex shrink-0 border-b border-border/50 px-6 bg-black/10">
                      <button 
                        onClick={() => setIntakeMode("manual")} 
                        className={cn(
                          "px-6 py-3 font-mono text-sm tracking-widest uppercase transition-all border-b-2 relative", 
                          intakeMode === "manual" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Manual Entry
                      </button>
                      <button 
                        onClick={() => {
                          setIntakeMode("import")
                          setFolderDropError("")
                        }} 
                        className={cn(
                          "px-6 py-3 font-mono text-sm tracking-widest uppercase transition-all border-b-2 relative", 
                          intakeMode === "import" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Batch Import
                      </button>
                    </div>

                     <div className="p-6">
                      {intakeMode === "manual" ? (
                        <form onSubmit={handleSubmit(onSubmitManual)} className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Project Name *</Label>
                              <Input {...register("name")} className="bg-black/20 focus:border-primary recessed-3d" />
                              {errors.name && <span className="text-[10px] font-mono text-destructive uppercase">{errors.name.message as string}</span>}
                            </div>
                            <div className="space-y-2">
                              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Client Name *</Label>
                              <Input {...register("clientName")} className="bg-black/20 focus:border-primary recessed-3d" />
                              {errors.clientName && <span className="text-[10px] font-mono text-destructive uppercase">{errors.clientName.message as string}</span>}
                            </div>
                            <div className="space-y-2">
                              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">System Status *</Label>
                              <select {...register("status")} defaultValue="" className="flex h-10 w-full bg-black/20 border-none px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary recessed-3d">
                                <option value="" disabled className="bg-background text-muted-foreground">Select Status...</option>
                                <option value="Active" className="bg-background">Active</option>
                                <option value="Planning" className="bg-background">Planning</option>
                                 <option value="In progress" className="bg-background">In progress</option>
                                 <option value="On hold" className="bg-background">On hold</option>
                                <option value="Completed" className="bg-background">Completed</option>
                                 <option value="Rejected for bid" className="bg-background">Rejected for bid</option>
                              </select>
                              {errors.status && <span className="text-[10px] font-mono text-destructive uppercase">{errors.status.message as string}</span>}
                            </div>
                            <div className="space-y-2">
                               <Label htmlFor="project-manager" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">PM Assignment *</Label>
                               <select
                                 id="project-manager"
                                 {...register("projectManagerId")}
                                 disabled={!isAdmin || loadingProjectManagers || !projectManagers?.length}
                                 className="flex h-10 w-full bg-black/20 border-none px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary recessed-3d disabled:cursor-not-allowed disabled:opacity-60"
                               >
                                 <option value="" className="bg-background text-muted-foreground">
                                   {loadingProjectManagers ? "Loading Project Managers..." : projectManagersError ? "Unable to load managers" : !isAdmin ? "Administrator access required" : !projectManagers?.length ? "No eligible managers" : "Select a Project Manager..."}
                                 </option>
                                 {projectManagers?.map((manager) => (
                                   <option key={manager.id} value={manager.id} className="bg-background">
                                     {manager.name} · {manager.email}
                                   </option>
                                 ))}
                               </select>
                               {errors.projectManagerId && <span className="text-[10px] font-mono text-destructive uppercase">{errors.projectManagerId.message as string}</span>}
                               {projectManagersError && <span role="alert" className="text-[10px] font-mono text-destructive">Project Managers could not be loaded. Refresh and try again.</span>}
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Physical Address *</Label>
                              <Input {...register("address")} className="bg-black/20 focus:border-primary recessed-3d" />
                              {errors.address && <span className="text-[10px] font-mono text-destructive uppercase">{errors.address.message as string}</span>}
                            </div>
                            <div className="space-y-2">
                              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Region *</Label>
                              <Input {...register("region")} className="bg-black/20 focus:border-primary recessed-3d" />
                              {errors.region && <span className="text-[10px] font-mono text-destructive uppercase">{errors.region.message as string}</span>}
                            </div>
                            <div className="space-y-2">
                              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Start Date *</Label>
                              <Input {...register("startDate")} type="date" className="bg-black/20 focus:border-primary recessed-3d [color-scheme:dark]" />
                              {errors.startDate && <span className="text-[10px] font-mono text-destructive uppercase">{errors.startDate.message as string}</span>}
                            </div>
                            <div className="space-y-2">
                              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">End Date *</Label>
                              <Input {...register("targetDate")} type="date" className="bg-black/20 focus:border-primary recessed-3d [color-scheme:dark]" />
                              {errors.targetDate && <span className="text-[10px] font-mono text-destructive uppercase">{errors.targetDate.message as string}</span>}
                            </div>
                            <div className="space-y-2">
                              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Allocated Budget ($) *</Label>
                              <Input {...register("budgeted")} type="number" step="0.01" placeholder="e.g. 500000.00" className="bg-black/20 focus:border-primary recessed-3d font-mono" />
                              {errors.budgeted && <span className="text-[10px] font-mono text-destructive uppercase">{errors.budgeted.message as string}</span>}
                            </div>
                            <div className="space-y-2">
                              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Exterior Image URL (Optional)</Label>
                              <Input {...register("exteriorImage")} placeholder="https://..." className="bg-black/20 focus:border-primary recessed-3d font-mono text-xs" />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Mission Description *</Label>
                              <Textarea {...register("description")} className="bg-black/20 focus:border-primary recessed-3d min-h-[100px]" />
                              {errors.description && <span className="text-[10px] font-mono text-destructive uppercase">{errors.description.message as string}</span>}
                            </div>
                          </div>
                          
                          <div className="flex justify-end pt-4 border-t border-border/50">
                            <Button type="submit" disabled={createProject.isPending} className="btn-3d font-mono uppercase tracking-widest px-8">
                              <span className="drop-shadow-sm">{createProject.isPending ? "Transmitting..." : "Initialize"}</span>
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div className="space-y-6">
                          {!parsedRows.length && !folderFiles.length ? (
                            <div 
                              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                              onDragLeave={() => setDragActive(false)}
                              onDrop={handleFolderDrop}
                              data-testid="project-folder-dropzone"
                              className={cn(
                                "p-12 flex flex-col items-center justify-center text-center transition-all bg-black/10 rounded-2xl recessed-3d",
                                dragActive ? "border-primary bg-primary/10 scale-[1.02]" : ""
                              )}
                            >
                              <input
                                ref={folderInputRef}
                                type="file"
                                className="hidden"
                                id="folder-upload"
                                onChange={(event) => {
                                  setFolderDropError("")
                                  collectFolderFiles(Array.from(event.target.files || []))
                                  void startFolderImport()
                                }}
                                disabled={isFolderImportActive}
                                {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                              />
                              <input type="file" accept=".csv,.json" onChange={handleFileInput} className="hidden" id="file-upload" />
                              <label htmlFor="folder-upload" className="cursor-pointer flex flex-col items-center gap-4">
                                <div className="h-20 w-20 rounded-full bg-background flex items-center justify-center surface-3d shadow-xl">
                                  <FolderUp className="h-10 w-10 text-primary drop-shadow-sm" />
                                </div>
                                <div>
                                  <p className="text-lg font-heading tracking-tight mb-1 drop-shadow-sm">Drop a project folder</p>
                                  <p className="text-sm font-mono text-muted-foreground">Or choose a folder. Supported construction documents and images are uploaded privately.</p>
                                  {folderDropError && <p role="alert" className="mt-3 text-sm text-destructive">{folderDropError}</p>}
                                </div>
                                <div className="flex gap-4 mt-4">
                                  <span className="flex items-center gap-1.5 text-xs font-mono surface-3d px-3 py-1 text-muted-foreground"><FileText className="h-3 w-3" /> Documents</span>
                                  <span className="flex items-center gap-1.5 text-xs font-mono surface-3d px-3 py-1 text-muted-foreground">Private storage</span>
                                </div>
                              </label>
                              <label htmlFor="file-upload" className="mt-6 cursor-pointer text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-primary">
                                Import a legacy CSV or JSON file instead
                              </label>
                            </div>
                          ) : folderFiles.length ? (
                            <div className="space-y-4">
                              <div className="flex flex-col gap-4 bg-black/30 p-4 rounded-xl recessed-3d sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-5">
                                  <FolderUp className="h-8 w-8 text-primary" />
                                  <div>
                                    <p className="font-mono text-sm font-bold">{folderFiles.length} supported file{folderFiles.length === 1 ? "" : "s"} ready</p>
                                    <p className="text-xs font-mono text-muted-foreground">
                                      {skippedFolderFiles.length} skipped · {folderProgress.uploaded} uploaded · {folderProgress.failed} failed
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-3">
                                  <Button variant="outline" onClick={clearFolderImport} disabled={isFolderImportActive} className="font-mono text-xs uppercase btn-3d">Reset</Button>
                                  <Button onClick={() => void startFolderImport()} disabled={isFolderImportActive || folderStatus === "success"} className="btn-3d font-mono uppercase tracking-widest bg-primary text-primary-foreground">
                                    {folderStatus === "uploading" ? `Uploading ${folderProgress.uploaded + folderProgress.failed}/${folderFiles.length}` : folderStatus === "building" ? "Analyzing documents..." : folderStatus === "success" ? "Project initialized" : folderStatus === "error" ? "Retry upload" : "Starting upload..."}
                                  </Button>
                                </div>
                              </div>
                              <div className="surface-3d bg-black/20 max-h-[230px] overflow-x-hidden overflow-y-auto p-3 font-mono text-xs">
                                {folderFiles.slice(0, 100).map(({ relativePath, file }) => <div key={relativePath} className="flex justify-between gap-4 border-b border-border/20 py-2"><span className="truncate">{relativePath}</span><span className="shrink-0 text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span></div>)}
                                {folderFiles.length > 100 && <p className="pt-3 text-muted-foreground">Showing the first 100 files.</p>}
                                {!!skippedFolderFiles.length && <div className="mt-3 border-t border-destructive/30 pt-2 text-destructive">{skippedFolderFiles.slice(0, 20).map((item, index) => <p key={`${item.name}-${index}`}>{item.name}: {item.reason}</p>)}{skippedFolderFiles.length > 20 && <p>Plus {skippedFolderFiles.length - 20} more skipped files.</p>}</div>}
                              </div>
                              {folderError && <p role="alert" className="font-mono text-xs text-destructive">{folderError}</p>}
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="flex items-center justify-between bg-black/30 p-4 rounded-xl recessed-3d">
                                <div className="flex items-center gap-6">
                                  <div className="text-center">
                                    <p className="text-2xl font-mono font-bold text-foreground">{parsedRows.length}</p>
                                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Total Rows</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-2xl font-mono font-bold text-success">{validCount}</p>
                                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Valid</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-2xl font-mono font-bold text-destructive">{invalidCount}</p>
                                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Errors</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <Button variant="outline" onClick={() => setParsedRows([])} className="font-mono text-xs uppercase btn-3d" disabled={importStatus !== "idle"}>Reset</Button>
                                  <Button 
                                    onClick={handleImportSubmit} 
                                    disabled={validCount === 0 || importStatus !== "idle"}
                                    className="btn-3d font-mono uppercase tracking-widest bg-primary text-primary-foreground"
                                  >
                                    <span className="drop-shadow-sm">{importStatus === "processing" ? "Processing..." : importStatus === "success" ? "Success" : `Import ${validCount} Valid`}</span>
                                  </Button>
                                </div>
                              </div>

                              <div className="surface-3d bg-black/20 overflow-hidden">
                                <div className="max-h-[300px] overflow-x-hidden overflow-y-auto">
                                  <table className="w-full text-sm text-left">
                                    <thead className="text-[10px] font-mono uppercase text-muted-foreground bg-black/50 sticky top-0 z-10 shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                                      <tr>
                                        <th className="px-4 py-3 font-medium">Row</th>
                                        <th className="px-4 py-3 font-medium">Status</th>
                                        <th className="px-4 py-3 font-medium">Project Name</th>
                                        <th className="px-4 py-3 font-medium">Client</th>
                                        <th className="px-4 py-3 font-medium">Budget</th>
                                        <th className="px-4 py-3 font-medium">Validation Notes</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/30 font-mono text-xs">
                                      {parsedRows.map((row) => (
                                        <tr key={row.row} className={cn("hover:bg-white/5 transition-colors", !row.valid && "bg-destructive/5")}>
                                          <td className="px-4 py-3 font-medium text-muted-foreground">#{row.row}</td>
                                          <td className="px-4 py-3">
                                            {row.valid ? (
                                              <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" /> Valid</Badge>
                                            ) : (
                                              <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" /> Invalid</Badge>
                                            )}
                                          </td>
                                          <td className="px-4 py-3 truncate max-w-[150px]">{row.original.name || '-'}</td>
                                          <td className="px-4 py-3 max-w-[180px]">
                                            <div className="flex min-w-0 items-center gap-2">
                                              <ClientIdentity name={row.original.clientName} logoUrl={row.original.clientLogoUrl} size="sm" />
                                              <span className="truncate">{row.original.clientName || '-'}</span>
                                            </div>
                                          </td>
                                          <td className="px-4 py-3">${row.original.budgeted || '0.00'}</td>
                                          <td className="px-4 py-3 text-destructive truncate max-w-[200px]">
                                            {!row.valid && row.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="w-full max-w-3xl">
              <GlobalSearch />
            </div>
          </div>

          <ProjectStage projects={projects} loading={loadingProjects} />

          {/* Summary errors affect the internal budget and activity feed. */}
          {dashboardSummary.isError && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <span>Dashboard metrics and activity are unavailable.</span>
              <Button variant="outline" size="sm" disabled={dashboardSummary.isFetching} onClick={() => void dashboardSummary.refetch()}>Retry dashboard metrics</Button>
            </div>
          )}
          {/* Financial overview */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>All-time totals for projects you can access. Refreshes every minute.</p>
            {financialSummary.isError && (
              <div role="alert" className="flex flex-wrap items-center gap-3">
                <span>Financial totals are unavailable.</span>
                <Button variant="outline" size="sm" disabled={financialSummary.isFetching} onClick={() => void financialSummary.refetch()}>Retry financial totals</Button>
              </div>
            )}
          </div>
          <FinancialFiguresGrid aria-label="Financial overview" className="ledger" amountAllowance={50}>
            {financialCards.map(({ label, description, value, icon: Icon, accent, loading }) => (
              <Card key={label} className="ledger-cell group min-w-0 rounded-none border-0 shadow-none">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex min-h-24 flex-col justify-between">
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div><p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p></div>
                      <div className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center", accent)}>
                        <Icon className="h-5 w-5 drop-shadow-sm" />
                      </div>
                    </div>
                    <p className="font-heading text-3xl font-extrabold tabular-nums tracking-[-0.03em] text-foreground sm:text-[2.1rem]">
                      <span data-financial-amount className="inline-block whitespace-nowrap">{loading ? "—" : value === undefined ? "Unavailable" : formatCurrency(value)}</span>
                    </p>
                    <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer select-none">Details</summary><p className="mt-1 leading-relaxed">{description}</p></details>
                  </div>
                </CardContent>
              </Card>
            ))}
          </FinancialFiguresGrid>

          {/* Main Panels */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-6 md:gap-8">
            
            {/* Active Projects List */}
            <div className="min-w-0 space-y-4">
              <div className="hud-section-head">
                <ShieldAlert className="h-4 w-4 text-primary" />
                <h2>Project Portfolio</h2>
                <span aria-hidden="true" className="hud-rule flex-1" />
                <span className="hud-index">{loadingProjects ? "--" : projectQuery.isError ? "Unavailable" : `${projects?.length ?? 0} listed`}</span>
              </div>
              
              <div className="pgrid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))" }}>
                {loadingProjects ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-[17rem] skeleton-line rounded-2xl" />
                  ))
                ) : projectQuery.isError ? (
                  <div role="alert" className="col-span-full rounded-xl border border-destructive/30 p-5 text-sm">
                    <p>Projects are unavailable. Their count is not zero.</p>
                    <Button className="mt-3" variant="outline" size="sm" onClick={() => void projectQuery.refetch()} disabled={projectQuery.isFetching}>Retry projects</Button>
                  </div>
                ) : projects?.length === 0 ? (
                  <div className="col-span-2 text-center py-16 glass-panel rounded-sm border border-border/50">
                    <Building className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-mono tracking-widest text-foreground uppercase">No projects yet</h3>
                    <p className="text-muted-foreground font-mono text-xs mt-2">Initialize a project to see it here.</p>
                  </div>
                ) : projects?.map((project) => (
                  <ProjectCard key={project.id} project={project} layout="compact" onOpen={() => setLocation(`/projects/${project.id}`)} />
                ))}
              </div>
            </div>

            {/* System Activity Stream */}
            <div className="space-y-4">
              <div className="hud-section-head">
                <Activity className="h-4 w-4 text-[hsl(var(--signal))]" />
                <h2>Activity Stream</h2>
                <span aria-hidden="true" className="hud-rule flex-1" />
              </div>
              <Card className="hud-frame overflow-hidden border-border/60 bg-card">
                <CardContent className="hud-timeline p-0">
                  {loadingSummary ? (
                    <div className="space-y-4 p-5">{[0,1,2].map((i) => <div key={i} className="skeleton-line h-12" />)}</div>
                  ) : dashboardSummary.isError ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">Activity is unavailable. Retry dashboard metrics above.</div>
                  ) : summary?.recentActivity.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">No recorded project activity yet.</div>
                  ) : summary?.recentActivity.map((activity) => (
                    <div key={activity.id} className="hud-timeline-item group">
                      <div className="flex gap-4">
                        <span aria-hidden="true" className="hud-timeline-node" />
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug text-foreground/90 group-hover:text-foreground">
                            {activity.title}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {activity.description}
                          </p>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-[hsl(var(--signal))]">{activity.author}</span>
                            <span className="text-[10px] font-mono text-muted-foreground">{formatDate(activity.date)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Link href="/projects" className="block p-4 text-center text-xs font-mono uppercase tracking-widest text-primary border-t border-border/60 hover:bg-primary hover:text-primary-foreground transition-colors">
                    View projects
                  </Link>
                </CardContent>
              </Card>
            </div>

          </div>

        </div>
      </div>
    </>
  )
}
