import * as React from "react"
import {
  useGetDashboardSummary,
  useGetProjects,
  useCreateProject,
  getGetProjectsQueryKey,
  getGetDashboardSummaryQueryKey
} from "@workspace/api-client-react"
import { AppLayout } from "@/components/layout/app-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils"
import { Plus, Search, MapPin, Building, Activity, Camera, DollarSign, Clock, UploadCloud, FileJson, FileSpreadsheet, X, CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react"
import { Link, useLocation } from "wouter"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useQueryClient } from "@tanstack/react-query"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

// Strict validation schema, zero defaults
const projectSchema = z.object({
  name: z.string().min(1, "Required"),
  address: z.string().min(1, "Required"),
  region: z.string().min(1, "Required"),
  status: z.string().min(1, "Required"),
  pmName: z.string().min(1, "Required"),
  clientName: z.string().min(1, "Required"),
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
  const [search, setSearch] = React.useState("")
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const queryClient = useQueryClient()
  
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  })
  
  const { data: projects, isLoading: loadingProjects } = useGetProjects(
    { search: search || undefined },
    { query: { queryKey: getGetProjectsQueryKey({ search: search || undefined }) } }
  )

  const createProject = useCreateProject()

  // Intake State
  const [intakeMode, setIntakeMode] = React.useState<"manual" | "import">("manual")
  
  // Manual Form
  const { register, handleSubmit, formState: { errors }, reset: resetManualForm } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "", address: "", region: "", status: "", pmName: "",
      clientName: "", targetDate: "", description: "", exteriorImage: ""
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
  const [parsedRows, setParsedRows] = React.useState<any[]>([])
  const [importStatus, setImportStatus] = React.useState<"idle" | "processing" | "success">("idle")

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
        const res = projectSchema.safeParse(row)
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
      await createProject.mutateAsync({
        data: {
          ...row.data,
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

  return (
    <AppLayout>
      <div className="min-h-0 flex-1 md:overflow-auto bg-transparent pb-12">
        <div className="p-4 sm:p-6 md:p-8 max-w-[1600px] mx-auto space-y-8">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-border/50">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="h-px w-6 bg-primary"></span>
                <span className="text-xs font-mono uppercase tracking-widest text-primary">Global Overview</span>
              </div>
              <h1 className="text-4xl font-heading font-extrabold text-foreground tracking-tight drop-shadow-sm">Command Center</h1>
              <p className="text-muted-foreground mt-2 text-sm max-w-xl">
                Real-time telemetry across all active sites. Monitor progress, financials, and communications through encrypted channels.
              </p>
            </div>
            
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
              <div className="relative group w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input 
                  placeholder="Query projects..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full sm:w-[280px] bg-background/50 border-border/50 focus-visible:ring-primary/50 backdrop-blur-sm font-mono text-sm"
                />
              </div>

              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full sm:w-auto gap-2 btn-3d font-bold tracking-wide shadow-xl bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-5 sm:px-6">
                    <Plus className="h-4 w-4 drop-shadow-sm" />
                    <span className="sm:hidden drop-shadow-sm">NEW PROJECT</span>
                    <span className="hidden sm:inline drop-shadow-sm">INITIALIZE PROJECT</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl surface-3d p-0 border-border/50">
                  <div className="p-6 border-b border-border/50 bg-black/20 flex justify-between items-center shadow-[inset_0_-1px_3px_rgba(0,0,0,0.2)]">
                    <div>
                      <DialogTitle className="text-2xl font-heading tracking-tight flex items-center gap-2">
                        <Building className="h-6 w-6 text-primary" />
                        Initialize New Project
                      </DialogTitle>
                      <p className="text-sm text-muted-foreground mt-1 font-mono">Establish secure project telemetry parameters.</p>
                    </div>
                  </div>

                  <div className="bg-background/40">
                    <div className="flex border-b border-border/50 px-6 bg-black/10">
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
                        onClick={() => setIntakeMode("import")} 
                        className={cn(
                          "px-6 py-3 font-mono text-sm tracking-widest uppercase transition-all border-b-2 relative", 
                          intakeMode === "import" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Batch Import
                      </button>
                    </div>

                    <div className="p-6 max-h-[65vh] overflow-y-auto">
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
                              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">PM Assignment *</Label>
                              <Input {...register("pmName")} placeholder="Assigned Manager ID" className="bg-black/20 focus:border-primary recessed-3d" />
                              {errors.pmName && <span className="text-[10px] font-mono text-destructive uppercase">{errors.pmName.message as string}</span>}
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
                              <Label className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Target Date *</Label>
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
                          {!parsedRows.length ? (
                            <div 
                              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                              onDragLeave={() => setDragActive(false)}
                              onDrop={handleDrop}
                              className={cn(
                                "p-12 flex flex-col items-center justify-center text-center transition-all bg-black/10 rounded-xl recessed-3d",
                                dragActive ? "border-primary bg-primary/10 scale-[1.01]" : ""
                              )}
                            >
                              <input type="file" accept=".csv,.json" onChange={handleFileInput} className="hidden" id="file-upload" />
                              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-4">
                                <div className="h-20 w-20 rounded-full bg-background flex items-center justify-center surface-3d shadow-xl">
                                  <UploadCloud className="h-10 w-10 text-primary drop-shadow-sm" />
                                </div>
                                <div>
                                  <p className="text-lg font-heading tracking-tight mb-1 drop-shadow-sm">Drag and drop data file</p>
                                  <p className="text-sm font-mono text-muted-foreground">Supports .csv or .json formatted to protocol standards</p>
                                </div>
                                <div className="flex gap-4 mt-4">
                                  <span className="flex items-center gap-1.5 text-xs font-mono surface-3d px-3 py-1 text-muted-foreground"><FileSpreadsheet className="h-3 w-3" /> CSV</span>
                                  <span className="flex items-center gap-1.5 text-xs font-mono surface-3d px-3 py-1 text-muted-foreground"><FileJson className="h-3 w-3" /> JSON</span>
                                </div>
                              </label>
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
                                <div className="max-h-[300px] overflow-auto">
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
                                          <td className="px-4 py-3 truncate max-w-[150px]">{row.original.clientName || '-'}</td>
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
          </div>

          {/* Stats Grid - Holographic style */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <Card className="surface-3d bg-card hover:bg-card/80 transition-all group">
              <CardContent className="p-6">
                <div className="flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground drop-shadow-sm">Active Nodes</p>
                    <div className="h-10 w-10 bg-primary/10 text-primary rounded-full surface-3d flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Building className="h-5 w-5 drop-shadow-sm" />
                    </div>
                  </div>
                  <div>
                    <p className="text-3xl font-mono font-bold tracking-tighter text-primary group-hover:text-glow transition-colors drop-shadow-[0_2px_10px_hsl(var(--primary)/0.5)]">{loadingSummary ? "-" : summary?.activeProjects}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="surface-3d bg-card hover:bg-card/80 transition-all group">
              <CardContent className="p-6">
                <div className="flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground drop-shadow-sm">Pending Auth</p>
                    <div className="h-10 w-10 bg-warning/10 text-warning rounded-full surface-3d flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Clock className="h-5 w-5 drop-shadow-sm" />
                    </div>
                  </div>
                  <div>
                    <p className="text-3xl font-mono font-bold tracking-tighter text-warning drop-shadow-[0_2px_10px_rgba(255,165,0,0.5)]">{loadingSummary ? "-" : summary?.awaitingApproval}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="surface-3d bg-card hover:bg-card/80 transition-all group">
              <CardContent className="p-6">
                <div className="flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground drop-shadow-sm">Visual Feeds</p>
                    <div className="h-10 w-10 bg-info/10 text-info rounded-full surface-3d flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Camera className="h-5 w-5 drop-shadow-sm" />
                    </div>
                  </div>
                  <div>
                    <p className="text-3xl font-mono font-bold tracking-tighter text-info drop-shadow-[0_2px_10px_rgba(0,191,255,0.5)]">{loadingSummary ? "-" : summary?.new360Photos}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="surface-3d bg-card hover:bg-card/80 transition-all group">
              <CardContent className="p-6">
                <div className="flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground drop-shadow-sm">Capital Outlay</p>
                    <div className="h-10 w-10 bg-success/10 text-success rounded-full surface-3d flex items-center justify-center group-hover:scale-110 transition-transform">
                      <DollarSign className="h-5 w-5 drop-shadow-sm" />
                    </div>
                  </div>
                  <div>
                    <p className="text-3xl font-mono font-bold tracking-tighter text-success drop-shadow-[0_2px_10px_rgba(0,255,128,0.5)]">
                      {loadingSummary ? "-" : `$${((summary?.budgeted || 0) / 1000000).toFixed(1)}M`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
            
            {/* Active Projects List */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-mono uppercase tracking-widest font-semibold">Active Deployments</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {loadingProjects ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="h-64 animate-pulse bg-card/50 glass-panel" />
                  ))
                ) : projects?.length === 0 ? (
                  <div className="col-span-2 text-center py-16 glass-panel rounded-sm border border-border/50">
                    <Building className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-mono tracking-widest text-foreground uppercase">No Telemetry Found</h3>
                    <p className="text-muted-foreground font-mono text-xs mt-2">Awaiting initialization of new project nodes.</p>
                  </div>
                ) : projects?.map((project) => (
                  <Card 
                    key={project.id} 
                    className="glass-panel overflow-hidden hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 cursor-pointer group flex flex-col border-border/50 hover:border-primary/30" 
                    onClick={() => setLocation(`/projects/${project.id}`)}
                  >
                    <div className="h-32 bg-black/40 relative overflow-hidden group-hover:bg-black/20 transition-colors">
                      {project.exteriorImage ? (
                        <div className="w-full h-full relative">
                          <img src={project.exteriorImage} alt={project.name} className="w-full h-full object-cover saturate-110 group-hover:scale-105 transition-transform duration-700" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent"></div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center tech-grid opacity-30">
                          <Building className="h-12 w-12 text-primary/40" />
                        </div>
                      )}
                      
                      {/* Technical Overlays */}
                      <div className="absolute top-0 left-0 w-full h-full pointer-events-none border-[0.5px] border-primary/20 scale-[0.98] group-hover:scale-[0.96] transition-transform duration-500"></div>
                      
                      <div className="absolute top-3 left-3 flex gap-2">
                        <Badge variant={getStatusColor(project.status) as any} className="uppercase font-mono text-[10px] tracking-widest rounded-none border-primary/30 backdrop-blur-md bg-background/80">
                          {project.status}
                        </Badge>
                      </div>
                      <div className="absolute top-3 right-3 text-[10px] font-mono text-primary/70 tracking-widest">
                        ID:{project.id.split('-')[0].toUpperCase()}
                      </div>
                    </div>
                    <CardContent className="p-5 flex-1 flex flex-col relative bg-card/60 backdrop-blur-sm z-10">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="font-heading font-bold text-xl tracking-tight leading-tight line-clamp-1 group-hover:text-primary transition-colors">{project.name}</h3>
                      </div>
                      <div className="space-y-4 mt-auto">
                        <div className="flex items-start gap-2 text-sm text-muted-foreground/80 font-mono">
                          <MapPin className="h-4 w-4 shrink-0 text-primary/50" />
                          <span className="truncate text-xs">{project.address}</span>
                        </div>
                        
                        <div className="pt-2 border-t border-border/30">
                          <div className="flex items-center justify-between text-xs font-mono mb-1.5 uppercase tracking-wider">
                            <span className="text-muted-foreground">Completion</span>
                            <span className="font-bold text-primary">{project.progress}%</span>
                          </div>
                          <div className="h-1 w-full bg-black/40 rounded-none overflow-hidden border border-border/30">
                            <div 
                              className="h-full bg-primary relative transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)]"
                              style={{ width: `${project.progress}%` }}
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full -translate-x-full animate-[shimmer_2s_infinite]"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* System Activity Stream */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-secondary" />
                <h2 className="text-lg font-mono uppercase tracking-widest font-semibold">Activity Stream</h2>
              </div>
              <Card className="glass-panel border-border/50 bg-card/60">
                <CardContent className="p-0 divide-y divide-border/30">
                  {loadingSummary ? (
                    <div className="p-8 text-center text-muted-foreground font-mono text-sm uppercase animate-pulse">Syncing logs...</div>
                  ) : summary?.recentActivity.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground font-mono text-sm uppercase">Stream Empty</div>
                  ) : summary?.recentActivity.map((activity) => (
                    <div key={activity.id} className="p-4 hover:bg-muted/20 transition-colors group">
                      <div className="flex gap-4">
                        <div className="h-8 w-8 rounded-none bg-secondary/10 border border-secondary/30 flex items-center justify-center shrink-0 group-hover:bg-secondary/20 transition-colors">
                          <Activity className="h-4 w-4 text-secondary group-hover:text-secondary-foreground transition-colors" />
                        </div>
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug text-foreground/90 group-hover:text-foreground">
                            {activity.title}
                          </p>
                          <p className="text-xs text-muted-foreground/70 line-clamp-2">
                            {activity.description}
                          </p>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-primary/70">{activity.author}</span>
                            <span className="text-[10px] font-mono text-muted-foreground/50">{formatDate(activity.date)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Link href="/messages" className="block p-4 text-center text-xs font-mono uppercase tracking-widest text-primary hover:bg-primary/10 hover:text-primary-foreground transition-colors">
                    Access Full Archive
                  </Link>
                </CardContent>
              </Card>
            </div>

          </div>

        </div>
      </div>
    </AppLayout>
  )
}