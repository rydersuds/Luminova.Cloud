import * as React from "react"
import { useLocation, useParams } from "wouter"
import { 
  useGetProject, 
  getGetProjectQueryKey,
  getGetProjectsQueryKey,
  getGetDashboardSummaryQueryKey,
  useCreateProjectPanorama,
  useCreateProjectScheduleImage,
  useDeleteProjectScheduleImage,
  useUpdateProjectScheduleImage,
  useUpdateProjectPanorama,
  useUpdateProject,
  useGetProjectActivity,
  useGetCurrentWorkspaceUser,
  useGetProjectManagers,
  getGetProjectManagersQueryKey,
  useOrganizeProjectFiles,
  useUploadProjectEntryAgreement,
  getGetProjectActivityQueryKey
} from "@workspace/api-client-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  Building, MapPin, Calendar, DollarSign, ArrowLeft, 
  Camera, Briefcase, FileText, CheckCircle2, ChevronRight, Activity, Clock,
  Maximize2, ChevronLeft, ChevronDown, Pencil, Search, Trash2, ExternalLink
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "@/hooks/use-toast"
import { PanoramaViewer } from "@/components/panorama-viewer"
import { ClientIdentity } from "@/components/client-identity"
import { cn, formatCurrency, formatDate, formatDateOnly, getStatusColor } from "@/lib/utils"
import { readImageDataUrl, uploadToSignedUrl, validateImageFile } from "@/lib/image-upload"
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
type ProjectScheduleImage = {
  id: string
  url: string
  name: string
  relativePath: string
  contentType: string
  size: number
  revision: string | null
  effectiveDate: string | null
  isCurrent: boolean
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
  const [isScheduleUploadOpen, setIsScheduleUploadOpen] = React.useState(false)
  const [scheduleImage, setScheduleImage] = React.useState<{ file: File; dataUrl: string; name: string } | null>(null)
  const [scheduleError, setScheduleError] = React.useState("")
  const [isScheduleUploading, setIsScheduleUploading] = React.useState(false)
  const [activeScheduleImage, setActiveScheduleImage] = React.useState<ProjectScheduleImage | null>(null)
  const [scheduleImageToRemove, setScheduleImageToRemove] = React.useState<ProjectScheduleImage | null>(null)
  const [scheduleRemoveError, setScheduleRemoveError] = React.useState("")
  const [editingScheduleImage, setEditingScheduleImage] = React.useState<ProjectScheduleImage | null>(null)
  const [scheduleRevision, setScheduleRevision] = React.useState("")
  const [scheduleEffectiveDate, setScheduleEffectiveDate] = React.useState("")
  const [scheduleIsCurrent, setScheduleIsCurrent] = React.useState(false)
  const [scheduleMetadataError, setScheduleMetadataError] = React.useState("")
  const [entryAgreementFile, setEntryAgreementFile] = React.useState<File | null>(null)
  const [entryAgreementError, setEntryAgreementError] = React.useState("")
  const [isEntryAgreementUploading, setIsEntryAgreementUploading] = React.useState(false)
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
  const uploadEntryAgreement = useUploadProjectEntryAgreement()
  const panoramaName = (label: string | null) => label || "Untitled panorama"
  const { data: currentUser } = useGetCurrentWorkspaceUser()
  const isAdmin = currentUser?.role === "Admin"
  const { data: projectManagers, isLoading: loadingProjectManagers, isError: projectManagersError } = useGetProjectManagers({
    query: { enabled: isAdmin, queryKey: getGetProjectManagersQueryKey() },
  })

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
  const createScheduleImage = useCreateProjectScheduleImage()
  const deleteScheduleImage = useDeleteProjectScheduleImage()
  const updateScheduleImage = useUpdateProjectScheduleImage()
  const updatePanorama = useUpdateProjectPanorama()
  const canManageSchedules = currentUser?.role === "Admin" || currentUser?.role === "Project Manager"
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
  const entryAgreement = project?.files.find(
    (file) => file.classification === "contract" && file.isEntryAgreement,
  )

  const handleOrganizeFiles = async () => {
    try {
      const result = await organizeFiles.mutateAsync({ projectId })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: getGetProjectActivityQueryKey(projectId) }),
      ])
      toast({ title: "Files organized", description: `${result.filesOrganized} files sorted into ${result.collectionsCreated} collections.` })
    } catch {
      toast({ title: "Organization failed", description: "The AI organizer could not complete this project.", variant: "destructive" })
    }
  }

  const handleEntryAgreementUpload = async () => {
    if (!entryAgreementFile) {
      setEntryAgreementError("Choose an agreement file first.")
      return
    }
    setEntryAgreementError("")
    setIsEntryAgreementUploading(true)
    try {
      const request = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: entryAgreementFile.name,
          size: entryAgreementFile.size,
          contentType: entryAgreementFile.type || "application/octet-stream",
        }),
      })
      const upload = await request.json() as { uploadURL?: string; objectPath?: string; error?: string }
      if (!request.ok || !upload.uploadURL || !upload.objectPath) {
        throw new Error(upload.error || "The entry agreement upload could not be started.")
      }
      await uploadToSignedUrl(entryAgreementFile, upload.uploadURL, {
        errorMessage: "The agreement could not be stored. Try again.",
      })
      await uploadEntryAgreement.mutateAsync({
        projectId,
        data: {
          objectPath: upload.objectPath,
          name: entryAgreementFile.name,
          size: entryAgreementFile.size,
          contentType: entryAgreementFile.type || "application/octet-stream",
        },
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: getGetProjectActivityQueryKey(projectId) }),
      ])
      setEntryAgreementFile(null)
      toast({ title: "Entry agreement uploaded", description: `${entryAgreementFile.name} is now the project's entry agreement.` })
    } catch (error) {
      setEntryAgreementError(error instanceof Error ? error.message : "The entry agreement could not be uploaded.")
    } finally {
      setIsEntryAgreementUploading(false)
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
    const validation = validateImageFile(file)
    if (!validation.valid) {
      setPanoramaError(validation.message)
      event.target.value = ""
      return
    }
    void readImageDataUrl(file)
      .then((dataUrl) => setPanoramaImage({ file, dataUrl, name: file.name }))
      .catch((error) => setPanoramaError(error instanceof Error ? error.message : "The image could not be read. Choose another file."))
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

      await uploadToSignedUrl(panoramaImage.file, upload.uploadURL, {
        errorMessage: "The image could not be stored. Try again.",
      })

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

  const resetScheduleForm = () => {
    setScheduleImage(null)
    setScheduleError("")
  }

  const handleScheduleDialogChange = (open: boolean) => {
    if (isScheduleUploading) return
    setIsScheduleUploadOpen(open)
    if (!open) resetScheduleForm()
  }

  const handleScheduleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setScheduleError("")
    setScheduleImage(null)
    if (!file) return
    const validation = validateImageFile(file, {
      messages: {
        "unsupported-type": "Choose a JPEG, PNG, or WebP schedule image.",
        "too-large": "Choose a schedule image that is 8 MB or smaller.",
      },
    })
    if (!validation.valid) {
      setScheduleError(validation.message)
      event.target.value = ""
      return
    }
    void readImageDataUrl(file)
      .then((dataUrl) => setScheduleImage({ file, dataUrl, name: file.name }))
      .catch((error) => setScheduleError(error instanceof Error ? error.message.replace("The image", "The schedule image") : "The schedule image could not be read. Choose another file."))
  }

  const handleScheduleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setScheduleError("")
    if (!scheduleImage) {
      setScheduleError("Add a schedule image.")
      return
    }
    setIsScheduleUploading(true)
    try {
      const validation = validateImageFile(scheduleImage.file)
      if (!validation.valid) throw new Error(validation.message)
      const request = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "schedule-image",
          projectId,
          name: scheduleImage.file.name,
          size: scheduleImage.file.size,
          contentType: validation.contentType,
        }),
      })
      const upload = await request.json() as { uploadURL?: string; objectPath?: string; error?: string }
      if (!request.ok || !upload.uploadURL || !upload.objectPath) {
        throw new Error(upload.error || "The schedule upload could not be started.")
      }
      await uploadToSignedUrl(scheduleImage.file, upload.uploadURL, {
        errorMessage: "The schedule image could not be stored. Try again.",
      })
      await createScheduleImage.mutateAsync({
        projectId,
        data: {
          objectPath: upload.objectPath,
          name: scheduleImage.file.name,
          size: scheduleImage.file.size,
          contentType: validation.contentType,
        },
      })
      await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) })
      setIsScheduleUploadOpen(false)
      resetScheduleForm()
      toast({
        title: "Schedule image uploaded",
        description: `${scheduleImage.file.name} is now available in the project schedule.`,
      })
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : "The schedule image could not be uploaded. Try again.")
    } finally {
      setIsScheduleUploading(false)
    }
  }

  const handleScheduleRemove = async () => {
    if (!scheduleImageToRemove) return
    setScheduleRemoveError("")
    try {
      await deleteScheduleImage.mutateAsync({
        projectId,
        scheduleImageId: scheduleImageToRemove.id,
      })
      await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) })
      setActiveScheduleImage((current) => current?.id === scheduleImageToRemove.id ? null : current)
      setScheduleImageToRemove(null)
      toast({
        title: "Schedule image removed",
        description: `${scheduleImageToRemove.name} is no longer shown in the project schedule.`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "The schedule image could not be removed. Try again."
      setScheduleRemoveError(message)
    }
  }

  const openScheduleEditor = (image: ProjectScheduleImage) => {
    setEditingScheduleImage(image)
    setScheduleRevision(image.revision ?? "")
    setScheduleEffectiveDate(image.effectiveDate ?? "")
    setScheduleIsCurrent(image.isCurrent)
    setScheduleMetadataError("")
  }

  const handleScheduleMetadataSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingScheduleImage) return
    setScheduleMetadataError("")
    try {
      await updateScheduleImage.mutateAsync({
        projectId,
        scheduleImageId: editingScheduleImage.id,
        data: {
          revision: scheduleRevision.trim() || null,
          effectiveDate: scheduleEffectiveDate || null,
          isCurrent: scheduleIsCurrent,
        },
      })
      await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) })
      setEditingScheduleImage(null)
      toast({
        title: scheduleIsCurrent ? "Current schedule updated" : "Schedule details updated",
        description: scheduleIsCurrent
          ? `${editingScheduleImage.name} is now the current project schedule.`
          : `Revision details for ${editingScheduleImage.name} were saved.`,
      })
    } catch (error) {
      setScheduleMetadataError(error instanceof Error ? error.message : "The schedule details could not be saved.")
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
    if (!project) return
    const formData = new FormData(e.currentTarget)
    const projectManagerId = formData.get("projectManagerId")
    updateProject.mutate({
      projectId,
      data: {
        name: formData.get("name") as string,
        status: formData.get("status") as string,
        startDate: formData.get("startDate") as string,
        targetDate: formData.get("targetDate") as string,
        description: formData.get("description") as string,
        ...(isAdmin &&
          typeof projectManagerId === "string" &&
          projectManagerId !== "__legacy__" &&
          projectManagerId !== project.projectManagerId &&
          projectManagerId
          ? { projectManagerId }
          : {}),
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) })
        queryClient.invalidateQueries({ queryKey: getGetProjectsQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })
        setIsEditOpen(false)
      },
      onError: () => toast({ title: "Project could not be saved", description: "Check the project manager selection and try again.", variant: "destructive" }),
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
      <>
        <div className="flex-1 p-8 flex items-center justify-center">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-muted" />
            <div className="h-4 w-32 bg-muted rounded" />
          </div>
        </div>
      </>
    )
  }

  if (!project) {
    return (
      <>
        <div className="flex-1 p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Project not found</h2>
          <Button onClick={() => setLocation("/")}>Back to Dashboard</Button>
        </div>
      </>
    )
  }

  const actualCost = project.lineItems.reduce((sum, item) => sum + item.invoiced, 0)
  const budgetVariance = project.budgeted - actualCost
  const varianceIsPositive = budgetVariance >= 0
  const clientQuoteRemaining = project.clientQuote.total - project.invoiced
  const projectProgress = Math.min(Math.max(project.progress, 0), 100)
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
    <>
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
                    Start: {formatDateOnly(project.startDate)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-primary" />
                    End: {formatDateOnly(project.targetDate)}
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
                      </div>
                       {isAdmin && (
                         <div className="space-y-2">
                           <Label htmlFor="projectManagerId">Project Manager</Label>
                           <select
                             id="projectManagerId"
                             name="projectManagerId"
                             defaultValue={project.projectManagerId ?? (project.pmName ? "__legacy__" : "")}
                             disabled={loadingProjectManagers || !projectManagers?.length}
                             className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                           >
                             <option value="">
                               {loadingProjectManagers ? "Loading Project Managers..." : projectManagersError ? "Unable to load managers" : !projectManagers?.length ? "No eligible managers" : "Select a Project Manager"}
                             </option>
                             {project.projectManagerId && !projectManagers?.some((manager) => manager.id === project.projectManagerId) && (
                               <option value={project.projectManagerId}>
                                 {project.pmName || "Current manager"} · Current assignment is no longer eligible
                               </option>
                             )}
                             {!project.projectManagerId && project.pmName && (
                               <option value="__legacy__">
                                 {project.pmName} · Legacy assignment
                               </option>
                             )}
                             {projectManagers?.map((manager) => (
                               <option key={manager.id} value={manager.id}>
                                 {manager.name} · {manager.email}
                               </option>
                             ))}
                           </select>
                           {projectManagersError && <p role="alert" className="text-xs text-destructive">Project Managers could not be loaded. Refresh and try again.</p>}
                         </div>
                       )}
                       <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                           <Label htmlFor="startDate">Start Date</Label>
                           <Input id="startDate" name="startDate" type="date" defaultValue={project.startDate} required />
                         </div>
                         <div className="space-y-2">
                           <Label htmlFor="targetDate">End Date</Label>
                           <Input id="targetDate" name="targetDate" type="date" defaultValue={project.targetDate} required />
                         </div>
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
              <div className="bg-card p-4 space-y-1">
                <p className="text-sm text-muted-foreground">Internal Budget</p>
                <p className="text-xl font-bold tabular-nums">{formatCurrency(project.budgeted)}</p>
              </div>
              <div className="bg-card p-4 space-y-1">
                <p className="text-sm text-muted-foreground">Invoiced expenses</p>
                <p className="text-xl font-bold tabular-nums">{formatCurrency(actualCost)}</p>
              </div>
              <div className="bg-card p-4 space-y-1">
                <p className="text-sm text-muted-foreground">Budget Remaining</p>
                <p className={cn("text-xl font-bold tabular-nums", varianceIsPositive ? "text-success" : "text-destructive")}>
                  {varianceIsPositive ? "+" : ""}{formatCurrency(budgetVariance)}
                </p>
              </div>
              <div className="bg-card p-4 space-y-1">
                <p className="text-sm text-muted-foreground">Total Progress</p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold tabular-nums">{projectProgress}%</p>
                  <div className="flex-1 h-1.5 bg-muted/70 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${projectProgress}%` }} />
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
              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Schedule</CardTitle>
                    <CardDescription>Project schedule images uploaded by your team or imported with the project folder.</CardDescription>
                  </div>
                  <Dialog open={isScheduleUploadOpen} onOpenChange={handleScheduleDialogChange}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full gap-2 sm:w-auto">
                        <FileText className="h-4 w-4" />
                        Upload schedule image
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Upload schedule image</DialogTitle>
                        <DialogDescription>Add a JPEG, PNG, or WebP schedule image to {project.name}.</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleScheduleUpload} className="space-y-4" noValidate>
                        <div className="space-y-2">
                          <Label htmlFor="schedule-image">Schedule image</Label>
                          <Input
                            id="schedule-image"
                            name="schedule-image"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleScheduleFile}
                            aria-describedby="schedule-image-help"
                          />
                          <p id="schedule-image-help" className="text-xs text-muted-foreground">JPEG, PNG, or WebP, up to 8 MB.</p>
                        </div>
                        {scheduleImage && (
                          <div className="overflow-hidden rounded-md border bg-muted">
                            <img src={scheduleImage.dataUrl} alt="Selected schedule preview" className="max-h-48 w-full object-contain" />
                            <p className="truncate px-3 py-2 text-xs text-muted-foreground">{scheduleImage.name}</p>
                          </div>
                        )}
                        {scheduleError && <p role="alert" className="text-sm text-destructive">{scheduleError}</p>}
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => handleScheduleDialogChange(false)} disabled={isScheduleUploading}>Cancel</Button>
                          <Button type="submit" disabled={isScheduleUploading}>
                            {isScheduleUploading ? "Uploading…" : "Upload schedule image"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  {project.scheduleImages.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-6 py-10 text-center">
                      <FileText className="mx-auto h-7 w-7 text-muted-foreground" />
                      <p className="mt-3 font-medium">No schedule images yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">Upload a schedule image or import a project folder containing one.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {project.scheduleImages.map((image) => (
                        <article
                          key={image.id}
                          className={cn(
                            "min-w-0 overflow-hidden rounded-lg border bg-card",
                            image.isCurrent && "border-primary shadow-md ring-1 ring-primary/30 sm:col-span-2 xl:col-span-2",
                          )}
                        >
                          {image.isCurrent && (
                            <div className="flex items-center gap-2 bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                              <CheckCircle2 className="h-4 w-4" />
                              Current schedule
                            </div>
                          )}
                          <button
                            type="button"
                            className="group block aspect-[4/3] w-full cursor-zoom-in bg-muted text-left"
                            onClick={() => setActiveScheduleImage(image)}
                            aria-label={`Open schedule image ${image.name}`}
                          >
                            <img src={image.url} alt={image.name} loading="lazy" decoding="async" className="h-full w-full object-contain transition-transform group-hover:scale-[1.02]" />
                          </button>
                          <div className="min-w-0 space-y-3 border-t p-3">
                            <div>
                              <p className="truncate font-medium" title={image.relativePath}>{image.name}</p>
                              {(image.revision || image.effectiveDate) && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {image.revision && <Badge variant="secondary">{image.revision}</Badge>}
                                  {image.effectiveDate && <Badge variant="outline">Effective {formatDateOnly(image.effectiveDate)}</Badge>}
                                </div>
                              )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground" title={image.relativePath}>{image.relativePath}</p>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-3">
                                <a href={image.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
                                  Open full image
                                </a>
                                {canManageSchedules && (
                                  <Button type="button" variant="ghost" size="sm" className="h-auto px-0 py-0 text-sm" onClick={() => openScheduleEditor(image)}>
                                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                    Edit details
                                  </Button>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-destructive hover:text-destructive"
                                onClick={() => {
                                  setScheduleRemoveError("")
                                  setScheduleImageToRemove(image)
                                }}
                                aria-label={`Remove schedule image ${image.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                                Remove
                              </Button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Dialog open={activeScheduleImage !== null} onOpenChange={(open) => !open && setActiveScheduleImage(null)}>
                <DialogContent className="h-[92dvh] w-[96vw] !max-w-6xl overflow-hidden p-0">
                  {activeScheduleImage && (
                    <div className="flex h-full min-w-0 flex-col">
                      <div className="flex min-h-0 flex-1 items-center justify-center bg-muted p-4 sm:p-8">
                        <img src={activeScheduleImage.url} alt={activeScheduleImage.name} className="max-h-full max-w-full object-contain" />
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-8">
                        <p className="min-w-0 truncate font-medium" title={activeScheduleImage.relativePath}>{activeScheduleImage.relativePath}</p>
                        <a href={activeScheduleImage.url} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-medium text-primary hover:underline">
                          Open full image
                        </a>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              <AlertDialog
                open={scheduleImageToRemove !== null}
                onOpenChange={(open) => {
                  if (!open && !deleteScheduleImage.isPending) {
                    setScheduleImageToRemove(null)
                    setScheduleRemoveError("")
                  }
                }}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove schedule image?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {scheduleImageToRemove?.name} will be removed from this schedule gallery. Imported source documents and other project media will stay in place.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {scheduleRemoveError && <p role="alert" className="text-sm text-destructive">{scheduleRemoveError}</p>}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleteScheduleImage.isPending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(event) => {
                        event.preventDefault()
                        void handleScheduleRemove()
                      }}
                      disabled={deleteScheduleImage.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleteScheduleImage.isPending ? "Removing…" : "Remove image"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Dialog open={editingScheduleImage !== null} onOpenChange={(open) => !open && setEditingScheduleImage(null)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Schedule details</DialogTitle>
                    <DialogDescription>Add revision details and choose whether this is the schedule crews should use.</DialogDescription>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={handleScheduleMetadataSave}>
                    <div className="space-y-2">
                      <Label htmlFor="schedule-revision">Revision</Label>
                      <Input id="schedule-revision" value={scheduleRevision} onChange={(event) => setScheduleRevision(event.target.value)} placeholder="Revision 4" maxLength={100} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="schedule-effective-date">Effective date</Label>
                      <Input id="schedule-effective-date" type="date" value={scheduleEffectiveDate} onChange={(event) => setScheduleEffectiveDate(event.target.value)} />
                    </div>
                    <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                      <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={scheduleIsCurrent} onChange={(event) => setScheduleIsCurrent(event.target.checked)} />
                      <span>
                        <span className="block font-medium">Mark as current schedule</span>
                        <span className="block text-sm text-muted-foreground">This will replace any existing current selection. Prior schedules remain visible.</span>
                      </span>
                    </label>
                    {scheduleMetadataError && <p role="alert" className="text-sm text-destructive">{scheduleMetadataError}</p>}
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setEditingScheduleImage(null)} disabled={updateScheduleImage.isPending}>Cancel</Button>
                      <Button type="submit" disabled={updateScheduleImage.isPending}>{updateScheduleImage.isPending ? "Saving…" : "Save details"}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

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
                              <div
                                className="h-10 w-10 shrink-0 overflow-hidden rounded-full flex items-center justify-center font-heading font-bold text-sm"
                                style={{ backgroundColor: `${trade.accent}20`, color: trade.accent }}
                              >
                                {trade.profilePhotoUrl ? (
                                  <img
                                    src={trade.profilePhotoUrl}
                                    alt={`${trade.companyName} profile logo`}
                                    className="h-full w-full object-contain p-1"
                                    style={{
                                      objectPosition: `${trade.profilePhotoPositionX ?? 50}% ${trade.profilePhotoPositionY ?? 50}%`,
                                      transform: `scale(${trade.profilePhotoZoom ?? 1})`,
                                      transformOrigin: `${trade.profilePhotoPositionX ?? 50}% ${trade.profilePhotoPositionY ?? 50}%`,
                                    }}
                                  />
                                ) : trade.initials}
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
                            {(project.pmName || "U").charAt(0)}
                          </div>
                           <span className="font-medium">{project.pmName || "Unassigned"}</span>
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
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle>Entry agreement</CardTitle>
                        <div className="flex items-center gap-2">
                          {entryAgreement && (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              1 file
                            </span>
                          )}
                          <input
                            id="entry-agreement-upload"
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx,.txt,.rtf"
                            onChange={(event) => {
                              setEntryAgreementError("")
                              setEntryAgreementFile(event.target.files?.[0] ?? null)
                              event.target.value = ""
                            }}
                            disabled={isEntryAgreementUploading}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="font-mono text-[10px] uppercase tracking-wider"
                            onClick={() => document.getElementById("entry-agreement-upload")?.click()}
                            disabled={isEntryAgreementUploading}
                          >
                            {entryAgreement ? "Replace" : "Upload"}
                          </Button>
                        </div>
                      </div>
                      <CardDescription>
                        {entryAgreement
                          ? "Open the imported contractor and insurance access notice."
                          : "No entry agreement is available."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {entryAgreement ? (
                        <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
                          <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium" title={entryAgreement.name}>{entryAgreement.name}</p>
                            {entryAgreement.relativePath !== entryAgreement.name && (
                              <p className="truncate text-xs text-muted-foreground" title={entryAgreement.relativePath}>{entryAgreement.relativePath}</p>
                            )}
                          </div>
                          <a
                            href={entryAgreement.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 scroll-my-1 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            aria-label={`Open entry agreement ${entryAgreement.name}`}
                            title={entryAgreement.name}
                            data-testid={`link-open-agreement-${entryAgreement.id}`}
                          >
                            Open
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </a>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Upload the authorized contractor and insurance access notice to make it available here.</p>
                      )}
                      {entryAgreementFile && (
                        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                          <p className="min-w-0 truncate text-sm" title={entryAgreementFile.name}>{entryAgreementFile.name}</p>
                          <Button
                            type="button"
                            size="sm"
                            className="shrink-0 font-mono text-[10px] uppercase tracking-wider"
                            onClick={() => void handleEntryAgreementUpload()}
                            disabled={isEntryAgreementUploading}
                          >
                            {isEntryAgreementUploading ? "Uploading…" : "Save agreement"}
                          </Button>
                        </div>
                      )}
                      {entryAgreementError && <p role="alert" className="mt-3 text-sm text-destructive">{entryAgreementError}</p>}
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
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle>Quoted vs Invoiced</CardTitle>
                      <CardDescription>Client billing issued to {project.clientName} against the current project quote</CardDescription>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <ClientIdentity name={project.clientName} logoUrl={project.clientLogoUrl} size="sm" />
                      <span className="max-w-[16rem] truncate text-sm font-medium">{project.clientName}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <p className="text-sm text-muted-foreground">Quoted to {project.clientName}</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(project.clientQuote.total)}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <p className="text-sm text-muted-foreground">Invoiced to {project.clientName}</p>
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
                      <span className="font-medium tabular-nums">{projectProgress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${projectProgress}%` }} />
                    </div>
                  </div>
                  {project.invoices.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Party</TableHead>
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
                              <TableCell>
                                {invoice.direction === "luminova_to_client" ? (
                                  <div className="flex min-w-0 items-center gap-2">
                                    <ClientIdentity name={invoice.clientName ?? project.clientName} logoUrl={invoice.clientLogoUrl ?? project.clientLogoUrl} size="sm" />
                                    <div className="min-w-0">
                                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Client</p>
                                      <p className="max-w-[12rem] truncate">{invoice.clientName ?? project.clientName}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Vendor</p>
                                    <p className="max-w-[12rem] truncate">{invoice.vendor}</p>
                                  </div>
                                )}
                              </TableCell>
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
                <CardHeader>
                  <div>
                    <CardTitle>Budget vs Invoiced Expenses</CardTitle>
                    <CardDescription>Internal cost budget with verified expenses invoiced to Luminova; client billings are excluded.</CardDescription>
                  </div>
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
    </>
  )
}
