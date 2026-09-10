import * as React from "react"
import { useLocation, useParams } from "wouter"
import { AppLayout } from "@/components/layout/app-layout"
import { 
  useGetProject, 
  getGetProjectQueryKey,
  getGetProjectsQueryKey,
  useCreateProjectPanorama,
  useUpdateProjectPanorama,
  useUpdateProject,
  useGetProjectActivity,
  useOrganizeProjectFiles,
  getGetProjectActivityQueryKey
} from "@workspace/api-client-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  Building, MapPin, Calendar, DollarSign, ArrowLeft, 
  Camera, Briefcase, FileText, CheckCircle2, ChevronRight, Activity, Clock,
  Maximize2, ChevronLeft, ChevronDown, Pencil, Search, Trash2
} from "lucide-react"
import { cn, formatCurrency, formatDate, getStatusColor } from "@/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "@/hooks/use-toast"
import { PanoramaViewer } from "@/components/panorama-viewer"
import { ClientIdentity } from "@/components/client-identity"

const PANORAMA_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_PANORAMA_BYTES = 8 * 1024 * 1024
type ProjectPanorama = {
  id: string
  url: string
  label: string | null
  location: string | null
  date: string | null
}
type ProjectPhoto = {
  id: string
  url: string
  caption: string
  phase: string
  date: string
  visualCaption?: string
  visualTags?: string[]
}
type PhotoFolderNode = {
  name: string
  path: string
  photos: ProjectPhoto[]
  children: PhotoFolderNode[]
}

function buildPhotoFolderTree(photos: ProjectPhoto[], hiddenRootFolder?: string): PhotoFolderNode[] {
  const root = new Map<string, PhotoFolderNode & { childMap: Map<string, PhotoFolderNode & { childMap: Map<string, never> }> }>()
  for (const photo of photos) {
    const captionParts = photo.caption.split("/").filter(Boolean)
    const parts = hiddenRootFolder && captionParts[0] === hiddenRootFolder
      ? captionParts.slice(1)
      : captionParts
    const folders = parts.length > 1 ? parts.slice(0, -1) : ["Project photos"]
    let level = root as Map<string, any>
    let node: any
    let path = ""
    for (const folder of folders) {
      path = path ? `${path}/${folder}` : folder
      node = level.get(folder)
      if (!node) {
        node = { name: folder, path, photos: [], children: [], childMap: new Map() }
        level.set(folder, node)
      }
      level = node.childMap
    }
    node.photos.push(photo)
  }
  const finalize = (nodes: Map<string, any>): PhotoFolderNode[] =>
    [...nodes.values()]
      .map((node) => ({ name: node.name, path: node.path, photos: node.photos, children: finalize(node.childMap) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  return finalize(root)
}

function countFolderPhotos(folder: PhotoFolderNode): number {
  return folder.photos.length + folder.children.reduce((total, child) => total + countFolderPhotos(child), 0)
}

export default function ProjectDetail({ projectIdOverride }: { projectIdOverride?: string } = {}) {
  const params = useParams()
  const [, setLocation] = useLocation()
  const projectId = projectIdOverride ?? params.id as string
  const queryClient = useQueryClient()
  const [isEditOpen, setIsEditOpen] = React.useState(false)
  const [isPanoramaUploadOpen, setIsPanoramaUploadOpen] = React.useState(false)
  const [panoramaImage, setPanoramaImage] = React.useState<{ file: File; dataUrl: string; name: string } | null>(null)
  const [panoramaError, setPanoramaError] = React.useState("")
  const [isPanoramaUploading, setIsPanoramaUploading] = React.useState(false)
  const [photoIndex, setPhotoIndex] = React.useState<number | null>(null)
  const [activePanorama, setActivePanorama] = React.useState<ProjectPanorama | null>(null)
  const [editingPanorama, setEditingPanorama] = React.useState<ProjectPanorama | null>(null)
  const [panoramaEditError, setPanoramaEditError] = React.useState("")
  const [collapsedPhotoCollections, setCollapsedPhotoCollections] = React.useState<Set<string>>(new Set())
  const initializedPhotoFoldersForProject = React.useRef<string | null>(null)
  const [photoSearch, setPhotoSearch] = React.useState("")
  const [exteriorPhotoError, setExteriorPhotoError] = React.useState("")
  const [exteriorPhotoStatus, setExteriorPhotoStatus] = React.useState("")
  const [savingExteriorPhotoId, setSavingExteriorPhotoId] = React.useState<string | null>(null)
  const organizeFiles = useOrganizeProjectFiles()
  const panoramaName = (label: string | null) => label || "Untitled panorama"

  const { data: project, isLoading } = useGetProject(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getGetProjectQueryKey(projectId)
    }
  })

  const { data: activityList } = useGetProjectActivity(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getGetProjectActivityQueryKey(projectId)
    }
  })

  const updateProject = useUpdateProject()
  const createPanorama = useCreateProjectPanorama()
  const updatePanorama = useUpdateProjectPanorama()
  const photoFolderTree = React.useMemo(() => {
    if (!project) return []
    const photoPaths = project.photos.map((photo) => photo.caption.split("/").filter(Boolean))
    const rootFolder = photoPaths[0]?.length > 1 &&
      photoPaths.every((parts) => parts.length > 1 && parts[0] === photoPaths[0][0])
      ? photoPaths[0][0]
      : undefined
    const query = photoSearch.trim().toLowerCase()
    const photos = query
      ? project.photos.filter((photo) =>
          [
            photo.caption,
            photo.phase,
            (photo as ProjectPhoto).visualCaption ?? "",
            ...((photo as ProjectPhoto).visualTags ?? []),
          ]
            .some((value) => value.toLowerCase().includes(query))
        )
      : project.photos
    return buildPhotoFolderTree(photos, rootFolder)
  }, [project, photoSearch])
  React.useEffect(() => {
    if (!project || photoSearch || initializedPhotoFoldersForProject.current === projectId) return
    const paths: string[] = []
    const collectPaths = (folders: PhotoFolderNode[]) => {
      for (const folder of folders) {
        paths.push(folder.path)
        collectPaths(folder.children)
      }
    }
    collectPaths(photoFolderTree)
    setCollapsedPhotoCollections(new Set(paths))
    initializedPhotoFoldersForProject.current = projectId
  }, [photoFolderTree, photoSearch, project, projectId])
  const invoiceFiles = project?.files.filter((file) => file.classification === "invoice") || []
  const quoteFiles = project?.files.filter((file) => file.classification === "quote") || []

  const handleOrganizeFiles = async () => {
    try {
      const result = await organizeFiles.mutateAsync({ projectId })
      await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) })
      toast({ title: "Files organized", description: `${result.filesOrganized} files sorted into ${result.collectionsCreated} collections.` })
    } catch {
      toast({ title: "Organization failed", description: "The AI organizer could not complete this project.", variant: "destructive" })
    }
  }
  const togglePhotoCollection = (collection: string) => {
    setCollapsedPhotoCollections((current) => {
      const next = new Set(current)
      if (next.has(collection)) next.delete(collection)
      else next.add(collection)
      return next
    })
  }

  const resetPanoramaForm = () => {
    setPanoramaImage(null)
    setPanoramaError("")
  }

  const handlePanoramaDialogChange = (open: boolean) => {
    if (isPanoramaUploading) return
    setIsPanoramaUploadOpen(open)
    if (!open) resetPanoramaForm()
  }

  const handlePanoramaFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setPanoramaError("")
    setPanoramaImage(null)
    if (!file) return
    if (!PANORAMA_TYPES.includes(file.type)) {
      setPanoramaError("Choose a JPEG, PNG, or WebP image.")
      event.target.value = ""
      return
    }
    if (file.size > MAX_PANORAMA_BYTES) {
      setPanoramaError("Choose an image that is 8 MB or smaller.")
      event.target.value = ""
      return
    }
    const reader = new FileReader()
    reader.onerror = () => setPanoramaError("The image could not be read. Choose another file.")
    reader.onload = () => setPanoramaImage({ file, dataUrl: String(reader.result), name: file.name })
    reader.readAsDataURL(file)
  }

  const handlePanoramaUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPanoramaError("")
    const formData = new FormData(event.currentTarget)
    const label = String(formData.get("panorama-label") ?? "").trim()
    const location = String(formData.get("panorama-location") ?? "").trim()
    const date = String(formData.get("panorama-date") ?? "")

    if (!panoramaImage) {
      setPanoramaError("Add a panorama image.")
      return
    }

    setIsPanoramaUploading(true)
    try {
      const request = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: panoramaImage.file.name,
          size: panoramaImage.file.size,
          contentType: panoramaImage.file.type,
        }),
      })
      const upload = await request.json() as { uploadURL?: string; objectPath?: string; error?: string }
      if (!request.ok || !upload.uploadURL || !upload.objectPath) {
        throw new Error(upload.error || "The panorama upload could not be started.")
      }

      const stored = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": panoramaImage.file.type },
        body: panoramaImage.file,
      })
      if (!stored.ok) throw new Error("The image could not be stored. Try again.")

      const details = {
        ...(label ? { label } : {}),
        ...(location ? { location } : {}),
        ...(date ? { date } : {}),
      }
      await createPanorama.mutateAsync({
        projectId,
        data: { objectPath: upload.objectPath, ...details },
      })
      await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) })
      setIsPanoramaUploadOpen(false)
      resetPanoramaForm()
      toast({
        title: "360° panorama uploaded",
        description: `${panoramaName(label)} is now available in the project gallery.`,
      })
    } catch (error) {
      setPanoramaError(error instanceof Error ? error.message : "The panorama could not be uploaded. Try again.")
    } finally {
      setIsPanoramaUploading(false)
    }
  }

  const openPanoramaEditor = (panorama: ProjectPanorama) => {
    setPanoramaEditError("")
    setActivePanorama(null)
    setEditingPanorama(panorama)
  }

  const handlePanoramaEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingPanorama) return
    setPanoramaEditError("")
    const formData = new FormData(event.currentTarget)
    const label = String(formData.get("panorama-edit-label") ?? "").trim()
    const location = String(formData.get("panorama-edit-location") ?? "").trim()
    const date = String(formData.get("panorama-edit-date") ?? "")

    try {
      await updatePanorama.mutateAsync({
        projectId,
        panoramaId: editingPanorama.id,
        data: {
          label: label || null,
          location: location || null,
          date: date || null,
        },
      })
      await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) })
      setEditingPanorama(null)
      toast({
        title: "Panorama details saved",
        description: `${panoramaName(label)} is up to date.`,
      })
    } catch {
      setPanoramaEditError("The panorama details could not be saved. Check the values and try again.")
    }
  }

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    updateProject.mutate({
      projectId,
      data: {
        name: formData.get("name") as string,
        status: formData.get("status") as string,
        progress: Number(formData.get("progress")),
        targetDate: formData.get("targetDate") as string,
        description: formData.get("description") as string,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) })
        setIsEditOpen(false)
      }
    })
  }

  const handleExteriorPhoto = async (photo: { id: string; url: string; caption: string }) => {
    if (savingExteriorPhotoId || project?.exteriorImage === photo.url) return
    setExteriorPhotoError("")
    setExteriorPhotoStatus("")
    setSavingExteriorPhotoId(photo.id)
    try {
      await updateProject.mutateAsync({
        projectId,
        data: { exteriorImage: photo.url },
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: getGetProjectsQueryKey() }),
      ])
      toast({
        title: "Exterior photo updated",
        description: `${photo.caption} is now the project cover.`,
      })
    } catch {
      setExteriorPhotoError(`Could not make ${photo.caption} the exterior photo. Try again.`)
    } finally {
      setSavingExteriorPhotoId(null)
    }
  }

  const handleRemoveExteriorPhoto = async () => {
    if (savingExteriorPhotoId || !project?.exteriorImage) return
    const projectQueryKey = getGetProjectQueryKey(projectId)
    const projectsQueryKey = getGetProjectsQueryKey()
    const previousProject = queryClient.getQueryData(projectQueryKey)
    const previousProjects = queryClient.getQueryData(projectsQueryKey)

    setExteriorPhotoError("")
    setExteriorPhotoStatus("")
    setSavingExteriorPhotoId("remove")
    queryClient.setQueryData(projectQueryKey, { ...project, exteriorImage: "" })
    queryClient.setQueryData(projectsQueryKey, (current: typeof previousProjects) =>
      Array.isArray(current)
        ? current.map((item) => item.id === projectId ? { ...item, exteriorImage: "" } : item)
        : current
    )

    try {
      await updateProject.mutateAsync({
        projectId,
        data: { exteriorImage: null },
      })
      setExteriorPhotoStatus("Exterior photo removed. The default project placeholder is now shown.")
      toast({
        title: "Exterior photo removed",
        description: "The default project placeholder is now shown.",
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: projectQueryKey }),
        queryClient.invalidateQueries({ queryKey: projectsQueryKey }),
      ])
    } catch {
      queryClient.setQueryData(projectQueryKey, previousProject)
      queryClient.setQueryData(projectsQueryKey, previousProjects)
      setExteriorPhotoError("Could not remove the exterior photo. Try again.")
    } finally {
      setSavingExteriorPhotoId(null)
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex-1 p-8 flex items-center justify-center">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-muted" />
            <div className="h-4 w-32 bg-muted rounded" />
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="flex-1 p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Project not found</h2>
          <Button onClick={() => setLocation("/")}>Back to Dashboard</Button>
        </div>
      </AppLayout>
    )
  }

  const actualCost = project.lineItems.reduce((sum, item) => sum + item.invoiced, 0)
  const budgetVariance = project.budgeted - actualCost
  const varianceIsPositive = budgetVariance >= 0
  const clientQuoteRemaining = project.clientQuote.total - project.invoiced
  const clientQuoteInvoicedPercent = project.clientQuote.total > 0
    ? Math.min((project.invoiced / project.clientQuote.total) * 100, 100)
    : 0
  const renderPhotoCard = (photo: ProjectPhoto) => {
    const index = project.photos.findIndex((item) => item.id === photo.id)
    return (
      <div key={photo.id} className={cn("group overflow-hidden rounded-lg border bg-card text-left", project.exteriorImage === photo.url ? "border-primary ring-2 ring-primary/30" : "border-border")}>
        <button type="button" onClick={() => setPhotoIndex(index)} className="block w-full cursor-zoom-in text-left" aria-label={`View ${photo.caption}`}>
          <div className="aspect-square bg-muted relative">
            <img src={photo.url} alt={photo.caption} loading="lazy" decoding="async" className="w-full h-full object-cover" />
            {project.exteriorImage === photo.url && <Badge className="absolute left-2 top-2 gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />Exterior photo</Badge>}
            <div className="absolute inset-0 bg-sidebar/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4 text-center">
              <div className="text-sidebar-foreground"><Maximize2 className="mx-auto mb-2 h-5 w-5" /><p className="text-sm font-medium">{photo.caption}</p></div>
            </div>
          </div>
        </button>
        <div className="border-t p-2">
          <Button
            type="button"
            size="sm"
            variant={project.exteriorImage === photo.url ? "destructive" : "outline"}
            className="w-full"
            disabled={savingExteriorPhotoId !== null}
            onClick={() => void (project.exteriorImage === photo.url ? handleRemoveExteriorPhoto() : handleExteriorPhoto(photo))}
            aria-label={project.exteriorImage === photo.url ? `Remove ${photo.caption} as exterior photo` : `Make ${photo.caption} exterior photo`}
          >
            {savingExteriorPhotoId === "remove" && project.exteriorImage === photo.url
              ? "Removing…"
              : savingExteriorPhotoId === photo.id
                ? "Saving…"
                : project.exteriorImage === photo.url
                  ? <><Trash2 className="mr-2 h-3.5 w-3.5" />Remove exterior photo</>
                  : "Make exterior photo"}
          </Button>
        </div>
      </div>
    )
  }
  const renderPhotoFolder = (folder: PhotoFolderNode, depth = 0): React.ReactNode => {
    const isCollapsed = !photoSearch.trim() && collapsedPhotoCollections.has(folder.path)
    return (
      <section key={folder.path} className="space-y-3" style={{ marginLeft: depth ? Math.min(depth * 16, 48) : undefined }}>
        <button
          type="button"
          onClick={() => togglePhotoCollection(folder.path)}
          className="flex w-full items-center gap-2 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted"
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <h4 className="min-w-0 flex-1 truncate font-heading text-lg font-semibold">{folder.name}</h4>
          <Badge variant="secondary">{countFolderPhotos(folder)}</Badge>
        </button>
        {!isCollapsed && (
          <div className="space-y-3">
            {folder.photos.length > 0 && <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{folder.photos.map(renderPhotoCard)}</div>}
            {folder.children.map((child) => renderPhotoFolder(child, depth + 1))}
          </div>
        )}
      </section>
    )
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-x-hidden overflow-y-auto bg-transparent flex flex-col">
        {/* Project Header (Dark Chrome) */}
        <div className="bg-transparent text-foreground shrink-0 border-b border-border/60">
          <div className="max-w-[1400px] mx-auto p-6 md:p-8 space-y-6">
            <button 
              onClick={() => setLocation("/")}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium w-fit"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Projects
            </button>
            
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={getStatusColor(project.status) as any} className="capitalize">
                    {project.status}
                  </Badge>
                  <span className="text-muted-foreground text-sm font-medium">ID: {project.id}</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-heading font-bold">{project.name}</h1>
                <div className="flex flex-wrap items-center gap-4 md:gap-6 text-sm text-muted-foreground">
                  <div className="flex min-w-0 items-start gap-1.5">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="break-words">{project.address}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-primary" />
                    Target: {formatDate(project.targetDate)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ClientIdentity name={project.clientName} logoUrl={project.clientLogoUrl} size="sm" />
                    <span>Client: {project.clientName}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex max-w-full flex-wrap items-center gap-3">
                <Button variant="outline" className="max-w-full whitespace-normal bg-transparent border-border text-foreground hover:bg-card/60 hover:text-foreground" onClick={() => setLocation(`/quotes?projectId=${project.id}`)}>
                  Vendor Quotes
                </Button>
                <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="max-w-full whitespace-normal bg-transparent border-border text-foreground hover:bg-card/60 hover:text-foreground">
                      Edit Project
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit Project</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleUpdate} className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Project Name</Label>
                        <Input id="name" name="name" defaultValue={project.name} required />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="status">Status</Label>
                          <select 
                            id="status" 
                            name="status" 
                            defaultValue={project.status}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="Active">Active</option>
                            <option value="Planning">Planning</option>
                             <option value="In progress">In progress</option>
                             <option value="On hold">On hold</option>
                            <option value="Completed">Completed</option>
                            <option value="Delayed">Delayed</option>
                             <option value="Rejected for bid">Rejected for bid</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="progress">Progress (%)</Label>
                          <Input id="progress" name="progress" type="number" min="0" max="100" defaultValue={project.progress} required />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="targetDate">Target Date</Label>
                        <Input id="targetDate" name="targetDate" type="date" defaultValue={project.targetDate} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea id="description" name="description" defaultValue={project.description} />
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={updateProject.isPending}>
                          {updateProject.isPending ? "Saving..." : "Save Changes"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border/50 rounded-lg overflow-hidden border border-border/70">
              <div className="bg-card/35 p-4 space-y-1 backdrop-blur-sm">
                <p className="text-sm text-muted-foreground">Internal Budget</p>
                <p className="text-xl font-bold tabular-nums">{formatCurrency(project.budgeted)}</p>
              </div>
              <div className="bg-card/35 p-4 space-y-1 backdrop-blur-sm">
                <p className="text-sm text-muted-foreground">Invoiced expenses</p>
                <p className="text-xl font-bold tabular-nums">{formatCurrency(actualCost)}</p>
              </div>
              <div className="bg-card/35 p-4 space-y-1 backdrop-blur-sm">
                <p className="text-sm text-muted-foreground">Budget Remaining</p>
                <p className={cn("text-xl font-bold tabular-nums", varianceIsPositive ? "text-success" : "text-destructive")}>
                  {varianceIsPositive ? "+" : ""}{formatCurrency(budgetVariance)}
                </p>
              </div>
              <div className="bg-card/35 p-4 space-y-1 backdrop-blur-sm">
                <p className="text-sm text-muted-foreground">Total Progress</p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold tabular-nums">{clientQuoteInvoicedPercent.toFixed(1)}%</p>
                  <div className="flex-1 h-1.5 bg-muted/70 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${clientQuoteInvoicedPercent}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Project Content */}
        <div className="flex-1 p-6 md:p-8 max-w-[1400px] w-full mx-auto">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-6 grid w-full grid-cols-3 md:flex md:justify-start h-auto bg-transparent gap-2 p-0">
              <TabsTrigger value="overview" className="data-[state=active]:bg-card data-[state=active]:shadow border border-transparent data-[state=active]:border-border px-4 py-2">Overview</TabsTrigger>
              <TabsTrigger value="photos" className="data-[state=active]:bg-card data-[state=active]:shadow border border-transparent data-[state=active]:border-border px-4 py-2">Photos & 360s</TabsTrigger>
              <TabsTrigger value="budget" className="data-[state=active]:bg-card data-[state=active]:shadow border border-transparent data-[state=active]:border-border px-4 py-2">Budget</TabsTrigger>
              <TabsTrigger value="trades" className="data-[state=active]:bg-card data-[state=active]:shadow border border-transparent data-[state=active]:border-border px-4 py-2 hidden md:flex">Trades</TabsTrigger>
              <TabsTrigger value="activity" className="data-[state=active]:bg-card data-[state=active]:shadow border border-transparent data-[state=active]:border-border px-4 py-2 hidden md:flex">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Project Description</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground whitespace-pre-wrap">{project.description || "No description provided."}</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Recent Trades on Site</CardTitle>
                        <CardDescription>Vendors scheduled or recently completed work</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => document.querySelector('[value="trades"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))}>View All</Button>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {project.trades.slice(0,3).map(trade => (
                          <div key={trade.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full flex items-center justify-center font-heading font-bold text-sm" style={{ backgroundColor: `${trade.accent}20`, color: trade.accent }}>
                                {trade.initials}
                              </div>
                              <div>
                                <p className="font-medium">{trade.companyName}</p>
                                <p className="text-xs text-muted-foreground">{trade.tradeType}</p>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setLocation(`/trades/${trade.id}`)}>
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Key Contacts</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Project Manager</p>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-heading font-bold text-xs">
                            {project.pmName.charAt(0)}
                          </div>
                          <span className="font-medium">{project.pmName}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Client</p>
                        <div className="flex items-center gap-2">
                          <ClientIdentity name={project.clientName} logoUrl={project.clientLogoUrl} size="sm" />
                          <span className="font-medium">{project.clientName}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-border">
                        {activityList?.slice(0, 4).map(act => (
                          <div key={act.id} className="p-4 text-sm">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-medium">{act.title}</span>
                              <span className="text-xs text-muted-foreground">{formatDate(act.date)}</span>
                            </div>
                            <p className="text-muted-foreground text-xs line-clamp-2">{act.description}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="photos" className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-heading font-semibold">360° Panoramas</h3>
                <Dialog open={isPanoramaUploadOpen} onOpenChange={handlePanoramaDialogChange}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Camera className="h-4 w-4" />
                      Upload 360°
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Upload 360° panorama</DialogTitle>
                      <DialogDescription>Add one panorama to {project.name}.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handlePanoramaUpload} className="space-y-4" noValidate>
                      <div className="space-y-2">
                        <Label htmlFor="panorama-image">Panorama image</Label>
                        <Input
                          id="panorama-image"
                          name="panorama-image"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handlePanoramaFile}
                          aria-describedby="panorama-image-help"
                        />
                        <p id="panorama-image-help" className="text-xs text-muted-foreground">JPEG, PNG, or WebP, up to 8 MB.</p>
                      </div>
                      {panoramaImage && (
                        <div className="overflow-hidden rounded-md border bg-muted">
                          <img src={panoramaImage.dataUrl} alt="Selected panorama preview" className="h-36 w-full object-cover" />
                          <p className="truncate px-3 py-2 text-xs text-muted-foreground">{panoramaImage.name}</p>
                        </div>
                      )}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="panorama-label">Label <span className="font-normal text-muted-foreground">(optional)</span></Label>
                          <Input id="panorama-label" name="panorama-label" maxLength={100} placeholder="Week 25" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="panorama-location">Location <span className="font-normal text-muted-foreground">(optional)</span></Label>
                          <Input id="panorama-location" name="panorama-location" maxLength={100} placeholder="Main floor" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="panorama-date">Capture date <span className="font-normal text-muted-foreground">(optional)</span></Label>
                        <Input id="panorama-date" name="panorama-date" type="date" />
                      </div>
                      {panoramaError && <p role="alert" className="text-sm text-destructive">{panoramaError}</p>}
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => handlePanoramaDialogChange(false)} disabled={isPanoramaUploading}>Cancel</Button>
                        <Button type="submit" disabled={isPanoramaUploading}>
                          {isPanoramaUploading ? "Uploading..." : "Upload panorama"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {project.panoramas.map(pano => (
                  <div key={pano.id} className="group relative h-[250px] overflow-hidden rounded-lg border border-border bg-muted/35">
                    <button
                      type="button"
                      onClick={() => setActivePanorama(pano)}
                      className="absolute inset-0 text-left cursor-pointer"
                    >
                    <img src={pano.url} alt={`360° panorama: ${panoramaName(pano.label)}`} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-background/90 text-foreground px-4 py-2 rounded-full font-medium shadow-lg flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        View 360°
                      </div>
                    </div>
                    <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-sidebar/90 to-transparent">
                      <p className="text-sidebar-foreground font-medium">{panoramaName(pano.label)}</p>
                      <div className="flex justify-between text-xs text-sidebar-foreground/70 mt-1">
                        <span>{pano.location || "Location not provided"}</span>
                        <span>{pano.date ? formatDate(pano.date) : "Capture date not provided"}</span>
                      </div>
                    </div>
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="absolute right-3 top-3 z-10 gap-2 shadow-md"
                      onClick={() => openPanoramaEditor(pano)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit details
                    </Button>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
                <h3 className="text-xl font-heading font-semibold">Standard Photos</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {project.exteriorImage && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void handleRemoveExteriorPhoto()}
                      disabled={savingExteriorPhotoId !== null}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {savingExteriorPhotoId === "remove" ? "Removing…" : "Remove exterior photo"}
                    </Button>
                  )}
                  <Button type="button" onClick={handleOrganizeFiles} disabled={organizeFiles.isPending}>
                    {organizeFiles.isPending ? "Organizing…" : "Organize with AI"}
                  </Button>
                </div>
              </div>
              {exteriorPhotoError && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {exteriorPhotoError}
                </p>
              )}
              <p role="status" aria-live="polite" className="sr-only">{exteriorPhotoStatus}</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={photoSearch}
                  onChange={(event) => setPhotoSearch(event.target.value)}
                  placeholder="Search photos by what’s visible, folder, or filename…"
                  className="pl-9"
                  aria-label="Search project photos"
                />
              </div>
              {photoFolderTree.map((folder) => renderPhotoFolder(folder))}
              {photoFolderTree.length === 0 && (
                <div className="rounded-lg border border-dashed px-6 py-12 text-center">
                  <Search className="mx-auto h-7 w-7 text-muted-foreground" />
                  <p className="mt-3 font-medium">No photos found</p>
                  <p className="mt-1 text-sm text-muted-foreground">Try an object, room, construction phase, condition, folder, or filename.</p>
                </div>
              )}

              <Dialog open={photoIndex !== null} onOpenChange={(open) => !open && setPhotoIndex(null)}>
                <DialogContent className="h-[92dvh] w-[96vw] !max-w-6xl overflow-hidden border-white/15 bg-black p-0 text-white">
                  {photoIndex !== null && project.photos[photoIndex] && (
                    <div className="flex h-full flex-col">
                      <div className="flex-1 min-h-0 p-4 sm:p-8">
                        <img
                          src={project.photos[photoIndex].url}
                          alt={project.photos[photoIndex].caption}
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4 border-t border-white/15 px-4 py-4 sm:px-8">
                        <Button
                          variant="outline"
                          size="icon"
                          className="border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white"
                          onClick={() => setPhotoIndex((photoIndex - 1 + project.photos.length) % project.photos.length)}
                          aria-label="Previous photo"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <div className="min-w-0 text-center">
                          <p className="truncate font-medium">{project.photos[photoIndex].caption}</p>
                          <p className="mt-1 text-xs text-white/55">{photoIndex + 1} of {project.photos.length}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white"
                          onClick={() => setPhotoIndex((photoIndex + 1) % project.photos.length)}
                          aria-label="Next photo"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              <Dialog open={activePanorama !== null} onOpenChange={(open) => !open && setActivePanorama(null)}>
                <DialogContent className="h-[92dvh] w-[96vw] !max-w-7xl overflow-hidden border-white/15 bg-black p-0 text-white">
                  {activePanorama && (
                    <>
                      <DialogTitle className="sr-only">{panoramaName(activePanorama.label)} 360 degree panorama</DialogTitle>
                      <PanoramaViewer panorama={activePanorama} formatDate={formatDate} onEdit={() => openPanoramaEditor(activePanorama)} />
                    </>
                  )}
                </DialogContent>
              </Dialog>

              <Dialog
                open={editingPanorama !== null}
                onOpenChange={(open) => {
                  if (!open && !updatePanorama.isPending) setEditingPanorama(null)
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit panorama details</DialogTitle>
                    <DialogDescription>Add, change, or clear the optional details for this panorama.</DialogDescription>
                  </DialogHeader>
                  {editingPanorama && (
                    <form onSubmit={handlePanoramaEdit} className="space-y-4" noValidate>
                      <div className="space-y-2">
                        <Label htmlFor="panorama-edit-label">Label <span className="font-normal text-muted-foreground">(optional)</span></Label>
                        <Input
                          id="panorama-edit-label"
                          name="panorama-edit-label"
                          maxLength={100}
                          defaultValue={editingPanorama.label ?? ""}
                          placeholder="Week 25"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="panorama-edit-location">Location <span className="font-normal text-muted-foreground">(optional)</span></Label>
                        <Input
                          id="panorama-edit-location"
                          name="panorama-edit-location"
                          maxLength={100}
                          defaultValue={editingPanorama.location ?? ""}
                          placeholder="Main floor"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="panorama-edit-date">Capture date <span className="font-normal text-muted-foreground">(optional)</span></Label>
                        <Input
                          id="panorama-edit-date"
                          name="panorama-edit-date"
                          type="date"
                          defaultValue={editingPanorama.date ?? ""}
                        />
                      </div>
                      {panoramaEditError && <p role="alert" className="text-sm text-destructive">{panoramaEditError}</p>}
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setEditingPanorama(null)} disabled={updatePanorama.isPending}>Cancel</Button>
                        <Button type="submit" disabled={updatePanorama.isPending}>
                          {updatePanorama.isPending ? "Saving..." : "Save details"}
                        </Button>
                      </DialogFooter>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="budget" className="space-y-6">
              {(invoiceFiles.length > 0 || quoteFiles.length > 0) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Source Files</CardTitle>
                    <CardDescription>Original uploaded invoice and quote documents</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    {[...invoiceFiles, ...quoteFiles].map((file) => (
                      <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted">
                        <FileText className="h-5 w-5 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{file.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{file.collection}</span>
                        </span>
                        <Badge variant="outline">{file.classification}</Badge>
                      </a>
                    ))}
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>Quoted vs Invoiced</CardTitle>
                  <CardDescription>Client billing issued to Weidner against the current project quote</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <p className="text-sm text-muted-foreground">Quoted to Weidner</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(project.clientQuote.total)}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <p className="text-sm text-muted-foreground">Invoiced to Weidner</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(project.invoiced)}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <p className="text-sm text-muted-foreground">Remaining to invoice</p>
                      <p className={cn("mt-1 text-2xl font-bold tabular-nums", clientQuoteRemaining < 0 && "text-destructive")}>
                        {formatCurrency(clientQuoteRemaining)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total progress</span>
                      <span className="font-medium tabular-nums">{clientQuoteInvoicedPercent.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${clientQuoteInvoicedPercent}%` }} />
                    </div>
                  </div>
                  {project.invoices.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...project.invoices]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((invoice) => (
                            <TableRow key={invoice.id}>
                              <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                              <TableCell>{formatDate(invoice.date)}</TableCell>
                              <TableCell><Badge variant="outline">{invoice.status}</Badge></TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(invoice.amount)}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Budget vs Invoiced Expenses</CardTitle>
                    <CardDescription>Internal cost budget with verified expenses invoiced to Luminova; client billings are excluded.</CardDescription>
                  </div>
                  <Button>Add Line Item</Button>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Budgeted</TableHead>
                        <TableHead className="text-right">Invoiced expenses</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {project.lineItems.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-xs">{item.code}</TableCell>
                          <TableCell className="font-medium">{item.description}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(item.budgeted)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(item.invoiced)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums font-medium", item.variance >= 0 ? "text-success" : "text-destructive")}>
                            {item.variance >= 0 ? "+" : ""}{formatCurrency(item.variance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Client Quote Detail</CardTitle>
                  <CardDescription>Revision: {project.clientQuote.revision}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {project.clientQuote.portions.map(portion => (
                        <TableRow key={portion.code}>
                          <TableCell>{portion.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(portion.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex justify-end pt-4 font-bold text-lg border-t border-border mt-4">
                    Total: <span className="tabular-nums ml-4">{formatCurrency(project.clientQuote.total)}</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="trades" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Assigned Trades</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Rating</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {project.trades.map(trade => (
                        <TableRow key={trade.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full flex items-center justify-center font-heading font-bold text-xs" style={{ backgroundColor: `${trade.accent}20`, color: trade.accent }}>
                                {trade.initials}
                              </div>
                              <div>
                                <p className="font-medium">{trade.companyName}</p>
                                <p className="text-xs text-muted-foreground">{trade.contactName}</p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {project.files
                                    .filter((file) => file.linkedEntityId === trade.id || file.relativePath.toLowerCase().includes(trade.companyName.toLowerCase()))
                                    .slice(0, 4)
                                    .map((file) => (
                                      <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                                        {file.name}
                                      </a>
                                    ))}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{trade.tradeType}</Badge>
                          </TableCell>
                          <TableCell>
                            {trade.reviewCount > 0 ? (
                              <div className="flex items-center gap-1">
                                <span className="font-medium">{trade.rating.toFixed(1)}</span>
                                <span className="text-xs text-muted-foreground">({trade.reviewCount} verified)</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">No verified reviews</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => setLocation(`/trades/${trade.id}`)}>
                              Profile
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Project Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative border-l border-border ml-3 space-y-8 pb-4">
                    {activityList?.map((act, i) => (
                      <div key={act.id} className="relative pl-6">
                        <div className="absolute w-3 h-3 bg-primary rounded-full -left-[6.5px] top-1.5 ring-4 ring-background" />
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium">{act.title}</h4>
                            <span className="text-xs text-muted-foreground">{formatDate(act.date)}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{act.description}</p>
                          <p className="text-xs font-medium text-foreground pt-1">by {act.author}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
        </div>
      </div>
    </AppLayout>
  )
}
