import * as React from "react"
import { useLocation, useParams } from "wouter"
import { useQueryClient } from "@tanstack/react-query"
import { 
  useGetTrade, 
  getGetTradeQueryKey,
  getGetTradesQueryKey,
  useUpdateTrade,
  useRequestTradeProfilePhotoUpload,
  useGetProjects,
  useGetCurrentWorkspaceUser,
  useCreateTradeJobHistory,
  useUpdateTradeJobHistory,
  useDeleteTradeJobHistory,
  useCreateTradeReview,
  useUpdateTradeReview,
  useDeleteTradeReview,
  useDeleteTrade,
  getGetVendorQuotesQueryKey,
} from "@workspace/api-client-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  MapPin, Star, Phone, Mail, Globe, ShieldCheck, FileCheck, ArrowLeft, History, MessageSquare, Pencil, Camera, Trash2
} from "lucide-react"
import { cn, formatCurrency, formatDate } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { uploadToSignedUrl, validateImageFile } from "@/lib/image-upload"
import { VendorIdentity } from "@/components/vendor-identity"

type Feedback = { kind: "success" | "error"; message: string } | null
type ErrorWithData = { data?: { error?: string }; message?: string }
type ProfileForm = {
  phone: string
  email: string
  website: string
  regions: string
  licence: string
  insurance: string
  insuranceExpiry: string
  profilePhotoPositionX: number
  profilePhotoPositionY: number
  profilePhotoZoom: number
}

const today = () => {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const errorMessage = (error: unknown, fallback: string) => {
  const typed = error as ErrorWithData
  return typed.data?.error || typed.message || fallback
}

export default function TradeDetail(_props: { tradeIdOverride?: string; params?: Record<string, string | undefined> } = {}) {
  const params = useParams()
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const tradeId = _props.tradeIdOverride ?? params.id as string

  const { data: trade, isLoading } = useGetTrade(tradeId, {
    query: {
      enabled: !!tradeId,
      queryKey: getGetTradeQueryKey(tradeId)
    }
  })
  const { data: projects } = useGetProjects()
  const { data: currentUser } = useGetCurrentWorkspaceUser()
  const updateTrade = useUpdateTrade()
  const requestProfilePhotoUpload = useRequestTradeProfilePhotoUpload()
  const createJobHistory = useCreateTradeJobHistory()
  const updateJobHistory = useUpdateTradeJobHistory()
  const deleteJobHistory = useDeleteTradeJobHistory()
  const createReview = useCreateTradeReview()
  const updateReview = useUpdateTradeReview()
  const deleteReview = useDeleteTradeReview()
  const deleteVendor = useDeleteTrade()
  const [historyDialog, setHistoryDialog] = React.useState<"create" | "edit" | null>(null)
  const [editingHistoryId, setEditingHistoryId] = React.useState<string | null>(null)
  const [reviewDialog, setReviewDialog] = React.useState(false)
  const [editReviewDialog, setEditReviewDialog] = React.useState(false)
  const [editingReviewId, setEditingReviewId] = React.useState<string | null>(null)
  const [feedback, setFeedback] = React.useState<Feedback>(null)
  const [profileDialog, setProfileDialog] = React.useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [confirmRelatedDelete, setConfirmRelatedDelete] = React.useState(false)
  const [deletionMode, setDeletionMode] = React.useState<"profile_only" | "profile_and_related_records">("profile_only")
  const [deleteError, setDeleteError] = React.useState("")
  const [profileError, setProfileError] = React.useState("")
  const [profilePhoto, setProfilePhoto] = React.useState<File | null>(null)
  const [removeProfilePhoto, setRemoveProfilePhoto] = React.useState(false)
  const [profileForm, setProfileForm] = React.useState<ProfileForm>({
    phone: "",
    email: "",
    website: "",
    regions: "",
    licence: "",
    insurance: "",
    insuranceExpiry: "",
    profilePhotoPositionX: 50,
    profilePhotoPositionY: 50,
    profilePhotoZoom: 1,
  })
  const profilePhotoPreview = React.useMemo(
    () => profilePhoto ? URL.createObjectURL(profilePhoto) : "",
    [profilePhoto],
  )
  React.useEffect(() => () => {
    if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview)
  }, [profilePhotoPreview])
  const [historyForm, setHistoryForm] = React.useState({ projectId: "", date: today(), amount: "", source: "" })
  const [reviewForm, setReviewForm] = React.useState({ projectId: "", date: today(), rating: "5", comment: "", source: "" })

  const isAdmin = currentUser?.role === "Admin"
  const canReview = isAdmin || currentUser?.role === "Project Manager"
  const availableProjects = projects ?? []
  const completedProjectIds = new Set(trade?.jobHistory.map((job) => job.projectId) ?? [])
  const reviewProjects = availableProjects.filter((project) => completedProjectIds.has(project.id))
  const refreshTrade = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getGetTradeQueryKey(tradeId) }),
    queryClient.invalidateQueries({ queryKey: getGetTradesQueryKey() }),
  ])

  const deleteVendorProfile = async (mode: "profile_only" | "profile_and_related_records") => {
    setDeleteError("")
    try {
      await deleteVendor.mutateAsync({ tradeId, data: { deletionMode: mode } })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetTradesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetVendorQuotesQueryKey() }),
      ])
      window.sessionStorage.setItem(
        "luminova-trade-directory-feedback-v1",
        mode === "profile_only"
          ? "Vendor profile removed. Related quotes and work history were kept."
          : "Vendor profile and related quotes, job history, and reviews were deleted.",
      )
      setLocation("/trades")
    } catch (error) {
      setDeleteError(errorMessage(error, "Unable to delete the vendor profile."))
    }
  }

  const continueDeletion = () => {
    if (deletionMode === "profile_and_related_records") {
      setConfirmRelatedDelete(true)
      return
    }
    void deleteVendorProfile("profile_only")
  }

  const openProfileEditor = () => {
    if (!trade) return
    setProfileError("")
    setProfilePhoto(null)
    setRemoveProfilePhoto(false)
    setProfileForm({
      phone: trade.phone,
      email: trade.email,
      website: trade.website,
      regions: trade.regions.join(", "),
      licence: trade.licence,
      insurance: trade.insurance,
      insuranceExpiry: trade.insuranceExpiry,
      profilePhotoPositionX: trade.profilePhotoPositionX,
      profilePhotoPositionY: trade.profilePhotoPositionY,
      profilePhotoZoom: trade.profilePhotoZoom,
    })
    setProfileDialog(true)
  }

  const chooseProfilePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    if (!file) return
    const validation = validateImageFile(file, {
      messages: {
        "unsupported-type": "Choose a JPEG, PNG, or WebP image under 8 MB.",
        "too-large": "Choose a JPEG, PNG, or WebP image under 8 MB.",
      },
    })
    if (!validation.valid) {
      setProfileError(validation.message)
      event.target.value = ""
      return
    }
    setProfileError("")
    setProfilePhoto(file)
    setRemoveProfilePhoto(false)
  }

  const submitProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    setProfileError("")
    try {
      let profilePhotoObjectPath: string | null | undefined
      if (profilePhoto) {
        const upload = await requestProfilePhotoUpload.mutateAsync({
          tradeId,
          data: {
            name: profilePhoto.name,
            size: profilePhoto.size,
            contentType: profilePhoto.type,
          },
        })
        await uploadToSignedUrl(profilePhoto, upload.uploadURL, {
          errorMessage: "The logo or profile image could not be stored.",
        })
        profilePhotoObjectPath = upload.objectPath
      } else if (removeProfilePhoto) {
        profilePhotoObjectPath = null
      }

      const regions = profileForm.regions
        .split(/[,\n]/)
        .map((region) => region.trim())
        .filter(Boolean)
      await updateTrade.mutateAsync({
        tradeId,
        data: {
          phone: profileForm.phone,
          email: profileForm.email,
          website: profileForm.website,
          regions,
          licence: profileForm.licence,
          insurance: profileForm.insurance,
          insuranceExpiry: profileForm.insuranceExpiry,
          profilePhotoPositionX: profileForm.profilePhotoPositionX,
          profilePhotoPositionY: profileForm.profilePhotoPositionY,
          profilePhotoZoom: profileForm.profilePhotoZoom,
          ...(profilePhotoObjectPath !== undefined ? { profilePhotoObjectPath } : {}),
        },
      })
      setProfileDialog(false)
      await refreshTrade()
      setFeedback({ kind: "success", message: "Vendor profile updated." })
    } catch (error) {
      setProfileError(errorMessage(error, "Unable to update the vendor profile."))
    }
  }

  const openNewHistory = () => {
    setFeedback(null)
    setEditingHistoryId(null)
    setHistoryForm({ projectId: "", date: today(), amount: "", source: "" })
    setHistoryDialog("create")
  }

  const openEditHistory = (history: NonNullable<typeof trade>["jobHistory"][number]) => {
    setFeedback(null)
    setEditingHistoryId(history.id)
    setHistoryForm({
      projectId: history.projectId,
      date: history.date,
      amount: (history.amount / 100).toFixed(2),
      source: history.source,
    })
    setHistoryDialog("edit")
  }

  const submitHistory = async (event: React.FormEvent) => {
    event.preventDefault()
    setFeedback(null)
    const amount = Number(historyForm.amount)
    if (!historyForm.projectId || !historyForm.source.trim() || !Number.isFinite(amount) || amount < 0) {
      setFeedback({ kind: "error", message: "Choose a project and enter a valid amount and source." })
      return
    }
    try {
      const data = {
        projectId: historyForm.projectId,
        date: historyForm.date,
        amount: Math.round(amount * 100),
        source: historyForm.source.trim(),
      }
      if (historyDialog === "edit" && editingHistoryId) {
        await updateJobHistory.mutateAsync({ tradeId, historyId: editingHistoryId, data })
      } else {
        await createJobHistory.mutateAsync({ tradeId, data })
      }
      setHistoryDialog(null)
      await refreshTrade()
      setFeedback({ kind: "success", message: historyDialog === "edit" ? "Verified work updated." : "Verified work recorded." })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to save verified work.") })
    }
  }

  const removeHistory = async (historyId: string) => {
    if (!window.confirm("Remove this verified job-history record?")) return
    setFeedback(null)
    try {
      await deleteJobHistory.mutateAsync({ tradeId, historyId })
      await refreshTrade()
      setFeedback({ kind: "success", message: "Verified work removed." })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to remove verified work.") })
    }
  }

  const openReview = () => {
    setFeedback(null)
    setReviewForm({ projectId: reviewProjects[0]?.id ?? "", date: today(), rating: "5", comment: "", source: "" })
    setReviewDialog(true)
  }

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault()
    setFeedback(null)
    if (!reviewForm.projectId || !reviewForm.comment.trim() || !reviewForm.source.trim()) {
      setFeedback({ kind: "error", message: "Choose a completed project and enter the review and source." })
      return
    }
    try {
      await createReview.mutateAsync({
        tradeId,
        data: {
          projectId: reviewForm.projectId,
          date: reviewForm.date,
          rating: Number(reviewForm.rating),
          comment: reviewForm.comment.trim(),
          source: reviewForm.source.trim(),
        },
      })
      setReviewDialog(false)
      await refreshTrade()
      setFeedback({ kind: "success", message: "Verified review submitted." })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to submit the review.") })
    }
  }

  const openEditReview = (review: NonNullable<typeof trade>["reviews"][number]) => {
    setFeedback(null)
    setEditingReviewId(review.id)
    setReviewForm({
      projectId: review.projectId,
      date: review.date,
      rating: String(review.rating),
      comment: review.comment,
      source: review.source,
    })
    setEditReviewDialog(true)
  }

  const submitEditReview = async (event: React.FormEvent) => {
    event.preventDefault()
    setFeedback(null)
    if (!editingReviewId || !reviewForm.comment.trim()) {
      setFeedback({ kind: "error", message: "Enter a review before saving." })
      return
    }
    try {
      await updateReview.mutateAsync({
        tradeId,
        reviewId: editingReviewId,
        data: {
          date: reviewForm.date,
          rating: Number(reviewForm.rating),
          comment: reviewForm.comment.trim(),
        },
      })
      setEditReviewDialog(false)
      await refreshTrade()
      setFeedback({ kind: "success", message: "Verified review updated." })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to update the review.") })
    }
  }

  const removeReview = async (reviewId: string) => {
    if (!window.confirm("Remove this submitted review? This cannot be undone.")) return
    setFeedback(null)
    try {
      await deleteReview.mutateAsync({ tradeId, reviewId })
      await refreshTrade()
      setFeedback({ kind: "success", message: "Verified review removed." })
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error, "Unable to remove the review.") })
    }
  }

  if (isLoading) {
    return (
      <>
        <div className="flex-1 p-8 flex items-center justify-center">
          <div className="animate-pulse h-12 w-12 rounded-full bg-muted" />
        </div>
      </>
    )
  }

  if (!trade) {
    return (
      <>
        <div className="flex-1 p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Trade profile not found</h2>
          <Button onClick={() => setLocation("/trades")}>Back to Directory</Button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="flex-1 overflow-x-hidden overflow-y-auto bg-background flex flex-col">
        <div className="border-b border-border bg-card">
          <div className="max-w-5xl mx-auto p-6 md:p-8">
            <button 
              onClick={() => setLocation("/trades")}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium w-fit mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Directory
            </button>

            <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
              <VendorIdentity
                vendorId={trade.id}
                name={trade.companyName}
                initials={trade.initials}
                accent={trade.accent}
                logoUrl={trade.profilePhotoUrl}
                positionX={trade.profilePhotoPositionX}
                positionY={trade.profilePhotoPositionY}
                zoom={trade.profilePhotoZoom}
                className="h-24 w-24 rounded-2xl text-3xl shadow-sm"
              />

              <div className="flex-1 space-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <h1 className="break-words text-3xl font-heading font-bold">{trade.companyName}</h1>
                  {(trade.specialties?.length ? trade.specialties : [trade.tradeType]).map((specialty) => (
                    <Badge key={specialty} variant="outline" className="border-primary text-primary">{specialty}</Badge>
                  ))}
                </div>
                <p className="text-lg text-muted-foreground">Contact: {trade.contactName}</p>
                <div className="flex flex-wrap items-center gap-4 text-sm font-medium pt-2">
                  <div className="flex items-center gap-1.5 text-foreground">
                    {trade.reviewCount > 0 ? (
                      <>
                        <Star className="h-4 w-4 fill-primary text-primary" />
                        {trade.rating.toFixed(1)} <span className="text-muted-foreground font-normal">({trade.reviewCount} verified reviews)</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground font-normal">No verified reviews</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground font-normal">
                    <History className="h-4 w-4" />
                    {trade.completedJobs} jobs completed
                  </div>
                </div>
              </div>

              <div className="flex flex-col w-full md:w-auto gap-3">
                {isAdmin && (
                  <Button
                    variant="destructive"
                    className="w-full gap-2"
                    onClick={() => {
                      setDeleteError("")
                      setDeletionMode("profile_only")
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Vendor
                  </Button>
                )}
                <Button variant="outline" className="w-full gap-2" onClick={openProfileEditor}>
                  <Pencil className="h-4 w-4" />
                  Edit Profile
                </Button>
                <Button className="w-full" onClick={() => setLocation(`/quotes?vendorId=${trade.id}`)}>View Vendor Quotes</Button>
                {trade.email?.trim() ? (
                  <Button variant="outline" className="w-full gap-2" asChild>
                    <a href={`mailto:${trade.email.trim()}`} title={`Email ${trade.companyName}`}>
                      <MessageSquare className="h-4 w-4" />
                      Message
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full gap-2" disabled title="Add a contact email to message this vendor.">
                    <MessageSquare className="h-4 w-4" />
                    Message
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 p-6 md:p-8 max-w-5xl mx-auto w-full">
          {feedback && (
            <div role={feedback.kind === "error" ? "alert" : "status"} className={cn("mb-6 rounded-md border p-3 text-sm", feedback.kind === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-primary/40 bg-primary/10")}>
              {feedback.message}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Contact Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    {trade.phone ? <a href={`tel:${trade.phone}`} className="hover:underline">{trade.phone}</a> : <span className="text-muted-foreground">Not added</span>}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {trade.email ? <a href={`mailto:${trade.email}`} className="break-all text-primary hover:underline">{trade.email}</a> : <span className="text-muted-foreground">Not added</span>}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    {trade.website ? <a href={trade.website} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{trade.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a> : <span className="text-muted-foreground">Not added</span>}
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium mb-1">Service Regions:</p>
                      {trade.regions.length ? <div className="flex flex-wrap gap-1">
                        {trade.regions.map(r => <Badge key={r} variant="secondary" className="text-[10px] px-1.5 py-0">{r}</Badge>)}
                      </div> : <p className="text-muted-foreground">Not added</p>}
                    </div>
                  </div>
                  {trade.sourceNotes && (
                    <details className="border-t border-border pt-4 text-sm">
                      <summary className="cursor-pointer font-medium">Source notes</summary>
                      <p className="mt-2 break-words whitespace-pre-wrap text-muted-foreground">{trade.sourceNotes}</p>
                    </details>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Credentials</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3 text-sm">
                    <FileCheck className="h-4 w-4 text-success mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">Licence</p>
                      <p className="text-muted-foreground font-mono mt-0.5">{trade.licence || "Not added"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <ShieldCheck className="h-4 w-4 text-success mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">Insurance</p>
                      <p className="text-muted-foreground mt-0.5">{trade.insurance || "Not added"}</p>
                      {trade.insuranceExpiry && <p className="text-xs text-muted-foreground mt-1">Expires {formatDate(trade.insuranceExpiry)}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="md:col-span-2 space-y-6">
              <Tabs defaultValue="history">
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <TabsList className="flex h-auto min-w-0 flex-1 flex-wrap justify-start border-b border-border rounded-none bg-transparent p-0 mb-0">
                  <TabsTrigger value="history" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2">Job History</TabsTrigger>
                  <TabsTrigger value="bids" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2">Recent Bids</TabsTrigger>
                  <TabsTrigger value="reviews" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2">Reviews</TabsTrigger>
                </TabsList>
                {isAdmin && <Button size="sm" className="max-w-full whitespace-normal" onClick={openNewHistory}>Record verified work</Button>}
                {canReview && <Button size="sm" variant="outline" className="max-w-full whitespace-normal" onClick={openReview} disabled={reviewProjects.length === 0}>Submit review</Button>}
                </div>

                <TabsContent value="history" className="mt-0">
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Project</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Contract Value</TableHead>
                            <TableHead>Source</TableHead>
                            {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trade.jobHistory.length > 0 ? trade.jobHistory.map((job) => (
                            <TableRow key={job.id}>
                              <TableCell className="font-medium">{job.projectName}</TableCell>
                              <TableCell>{formatDate(job.date)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(job.amount)}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">{job.source}</TableCell>
                              {isAdmin && (
                                <TableCell className="min-w-[8rem] text-right">
                                  <div className="flex flex-wrap justify-end gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => openEditHistory(job)}>Edit</Button>
                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void removeHistory(job.id)}>Remove</Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          )) : (
                            <TableRow>
                              <TableCell colSpan={isAdmin ? 5 : 4} className="h-24 text-center">
                                <p className="font-medium">No verified job history</p>
                                <p className="mt-1 text-sm text-muted-foreground">Completed work will appear after an administrator records a verified project.</p>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="bids" className="mt-0">
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Project</TableHead>
                            <TableHead>Scope</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trade.bids.map((bid, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{bid.projectName}</TableCell>
                              <TableCell className="text-muted-foreground">{bid.scope}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(bid.amount)}</TableCell>
                              <TableCell>
                                <Badge variant={bid.outcome === 'Won' ? 'success' : bid.outcome === 'Pending' ? 'warning' : 'secondary'}>
                                  {bid.outcome}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="reviews" className="mt-0 space-y-4">
                  {canReview && reviewProjects.length === 0 && (
                    <p className="text-sm text-muted-foreground">A verified completed project is required before submitting a review.</p>
                  )}
                  {trade.reviews.length > 0 ? trade.reviews.map((review) => (
                    <Card key={review.id}>
                      <CardContent className="p-5 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-foreground">{review.projectName}</p>
                            <p className="text-xs text-muted-foreground">Reviewed by {review.reviewer} • {formatDate(review.date)}</p>
                            <p className="text-xs text-muted-foreground mt-1">Verified via {review.source}</p>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="flex gap-1">
                              {Array.from({ length: 5 }).map((_, j) => (
                                <Star key={j} className={cn("h-4 w-4", j < review.rating ? "fill-primary text-primary" : "fill-muted text-muted")} />
                              ))}
                            </div>
                            {isAdmin && (
                              <div className="flex gap-2">
                                <Button type="button" variant="ghost" size="sm" onClick={() => openEditReview(review)}>Edit</Button>
                                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void removeReview(review.id)} disabled={deleteReview.isPending}>Remove</Button>
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-foreground/80 italic">"{review.comment}"</p>
                      </CardContent>
                    </Card>
                  )) : (
                    <Card>
                      <CardContent className="p-8 text-center">
                        <p className="font-medium">No verified reviews yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">Reviews will appear here after they are submitted and tied to a completed project.</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
      <Dialog open={profileDialog} onOpenChange={setProfileDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit vendor profile</DialogTitle>
             <DialogDescription>Add the contact, service area, credentials, and logo or profile image shown on this vendor page.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submitProfile(event)} className="space-y-5">
            <div className="flex flex-col gap-5 rounded-lg border border-border bg-muted/20 p-4 sm:flex-row sm:items-start">
              {profilePhotoPreview ? (
                <div className="h-32 w-32 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                  <img
                    src={profilePhotoPreview}
                    alt="New vendor logo or profile image preview"
                    className="h-full w-full object-contain bg-background p-1"
                    style={{
                      objectPosition: `${profileForm.profilePhotoPositionX}% ${profileForm.profilePhotoPositionY}%`,
                      transform: `scale(${profileForm.profilePhotoZoom})`,
                      transformOrigin: `${profileForm.profilePhotoPositionX}% ${profileForm.profilePhotoPositionY}%`,
                    }}
                  />
                </div>
              ) : (
                <VendorIdentity
                  vendorId={trade.id}
                  name={trade.companyName}
                  initials={trade.initials}
                  accent={trade.accent}
                  logoUrl={removeProfilePhoto ? null : trade.profilePhotoUrl}
                  positionX={profileForm.profilePhotoPositionX}
                  positionY={profileForm.profilePhotoPositionY}
                  zoom={profileForm.profilePhotoZoom}
                  className="h-32 w-32 rounded-xl text-3xl"
                />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="vendor-profile-photo">Logo or profile image</Label>
                <Input id="vendor-profile-photo" type="file" accept=".png,image/png,image/jpeg,image/webp" onChange={chooseProfilePhoto} />
                <p className="text-xs text-muted-foreground">Upload a PNG logo, JPEG, or WebP image. Maximum 8 MB. PNG logos are shown in full without cropping.</p>
                {(profilePhotoPreview || (trade.profilePhotoUrl && !removeProfilePhoto)) && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <Label htmlFor="vendor-photo-horizontal">Horizontal framing</Label>
                        <span className="font-mono text-xs text-muted-foreground">{profileForm.profilePhotoPositionX}%</span>
                      </div>
                      <Input id="vendor-photo-horizontal" type="range" min="0" max="100" value={profileForm.profilePhotoPositionX} onChange={(event) => setProfileForm((current) => ({ ...current, profilePhotoPositionX: Number(event.target.value) }))} />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <Label htmlFor="vendor-photo-vertical">Vertical framing</Label>
                        <span className="font-mono text-xs text-muted-foreground">{profileForm.profilePhotoPositionY}%</span>
                      </div>
                      <Input id="vendor-photo-vertical" type="range" min="0" max="100" value={profileForm.profilePhotoPositionY} onChange={(event) => setProfileForm((current) => ({ ...current, profilePhotoPositionY: Number(event.target.value) }))} />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <Label htmlFor="vendor-photo-zoom">Zoom</Label>
                        <span className="font-mono text-xs text-muted-foreground">{profileForm.profilePhotoZoom.toFixed(2)}×</span>
                      </div>
                      <Input id="vendor-photo-zoom" type="range" min="1" max="2" step="0.05" value={profileForm.profilePhotoZoom} onChange={(event) => setProfileForm((current) => ({ ...current, profilePhotoZoom: Number(event.target.value) }))} />
                    </div>
                  </div>
                )}
                {trade.profilePhotoUrl && !removeProfilePhoto && !profilePhoto && (
                  <Button type="button" variant="ghost" size="sm" className="h-auto gap-2 px-0 text-destructive hover:text-destructive" onClick={() => setRemoveProfilePhoto(true)}>
                    <Trash2 className="h-4 w-4" />
                    Remove current logo or image
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vendor-phone">Phone number</Label>
                <Input id="vendor-phone" type="tel" value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} maxLength={40} placeholder="403-555-0123" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor-email">Email</Label>
                <Input id="vendor-email" type="email" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} maxLength={254} placeholder="contact@vendor.ca" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor-website">Website</Label>
              <Input id="vendor-website" type="text" value={profileForm.website} onChange={(event) => setProfileForm((current) => ({ ...current, website: event.target.value }))} maxLength={500} placeholder="vendor.ca" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor-regions">Service regions</Label>
              <Textarea id="vendor-regions" value={profileForm.regions} onChange={(event) => setProfileForm((current) => ({ ...current, regions: event.target.value }))} placeholder="Calgary, Canmore, Airdrie" />
              <p className="text-xs text-muted-foreground">Separate regions with commas or new lines.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vendor-licence">License number</Label>
                <Input id="vendor-licence" value={profileForm.licence} onChange={(event) => setProfileForm((current) => ({ ...current, licence: event.target.value }))} maxLength={160} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor-insurance-expiry">Insurance expiry</Label>
                <Input id="vendor-insurance-expiry" type="date" value={profileForm.insuranceExpiry} onChange={(event) => setProfileForm((current) => ({ ...current, insuranceExpiry: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor-insurance">Insurance</Label>
              <Input id="vendor-insurance" value={profileForm.insurance} onChange={(event) => setProfileForm((current) => ({ ...current, insurance: event.target.value }))} maxLength={160} placeholder="Provider, policy, or coverage details" />
            </div>
            {profileError && <p role="alert" className="text-sm text-destructive">{profileError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProfileDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={updateTrade.isPending || requestProfilePhotoUpload.isPending}>
                {updateTrade.isPending || requestProfilePhotoUpload.isPending ? "Saving…" : "Save profile"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={historyDialog !== null} onOpenChange={(open) => !open && setHistoryDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{historyDialog === "edit" ? "Edit verified work" : "Record verified work"}</DialogTitle>
            <DialogDescription>Only persisted project records can be used for vendor history.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submitHistory(event)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="history-project">Completed project</Label>
              <select id="history-project" value={historyForm.projectId} onChange={(event) => setHistoryForm((current) => ({ ...current, projectId: event.target.value }))} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
                <option value="">Choose a project</option>
                {availableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="history-date">Completion date</Label>
                <Input id="history-date" type="date" value={historyForm.date} onChange={(event) => setHistoryForm((current) => ({ ...current, date: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="history-amount">Contract value ($)</Label>
                <Input id="history-amount" type="number" min="0" step="0.01" value={historyForm.amount} onChange={(event) => setHistoryForm((current) => ({ ...current, amount: event.target.value }))} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="history-source">Verification source</Label>
              <Input id="history-source" placeholder="e.g. signed completion certificate" value={historyForm.source} onChange={(event) => setHistoryForm((current) => ({ ...current, source: event.target.value }))} maxLength={300} required />
            </div>
            {feedback?.kind === "error" && <p role="alert" className="text-sm text-destructive">{feedback.message}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setHistoryDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={createJobHistory.isPending || updateJobHistory.isPending}>{historyDialog === "edit" ? "Save changes" : "Record work"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit verified review</DialogTitle>
            <DialogDescription>Reviews must reference a verified completed project for this vendor.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submitReview(event)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="review-project">Completed project</Label>
              <select id="review-project" value={reviewForm.projectId} onChange={(event) => setReviewForm((current) => ({ ...current, projectId: event.target.value }))} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" required>
                <option value="">Choose a project</option>
                {reviewProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="review-date">Review date</Label>
                <Input id="review-date" type="date" value={reviewForm.date} onChange={(event) => setReviewForm((current) => ({ ...current, date: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="review-rating">Rating</Label>
                <select id="review-rating" value={reviewForm.rating} onChange={(event) => setReviewForm((current) => ({ ...current, rating: event.target.value }))} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
                  {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-comment">Review</Label>
              <Textarea id="review-comment" value={reviewForm.comment} onChange={(event) => setReviewForm((current) => ({ ...current, comment: event.target.value }))} maxLength={2000} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-source">Verification source</Label>
              <Input id="review-source" placeholder="e.g. project closeout meeting" value={reviewForm.source} onChange={(event) => setReviewForm((current) => ({ ...current, source: event.target.value }))} maxLength={300} required />
            </div>
            {feedback?.kind === "error" && <p role="alert" className="text-sm text-destructive">{feedback.message}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReviewDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={createReview.isPending}>Submit review</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={editReviewDialog} onOpenChange={setEditReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct verified review</DialogTitle>
            <DialogDescription>
              The reviewer, completed project, and verification source stay attached to this record.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submitEditReview(event)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-review-date">Review date</Label>
                <Input id="edit-review-date" type="date" value={reviewForm.date} onChange={(event) => setReviewForm((current) => ({ ...current, date: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-review-rating">Rating</Label>
                <select id="edit-review-rating" value={reviewForm.rating} onChange={(event) => setReviewForm((current) => ({ ...current, rating: event.target.value }))} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
                  {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-review-comment">Review</Label>
              <Textarea id="edit-review-comment" value={reviewForm.comment} onChange={(event) => setReviewForm((current) => ({ ...current, comment: event.target.value }))} maxLength={2000} required />
            </div>
            {feedback?.kind === "error" && <p role="alert" className="text-sm text-destructive">{feedback.message}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditReviewDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={updateReview.isPending}>Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {isAdmin && (
        <>
          <Dialog
            open={deleteDialogOpen}
            onOpenChange={(open) => {
              if (deleteVendor.isPending) return
              setDeleteDialogOpen(open)
              if (!open) setDeleteError("")
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {trade.companyName}?</DialogTitle>
                <DialogDescription>
                  Choose what to remove. The containing project, import batch, and project files are never deleted.
                </DialogDescription>
              </DialogHeader>
              <RadioGroup
                value={deletionMode}
                onValueChange={(value) => setDeletionMode(value as typeof deletionMode)}
                className="gap-3"
              >
                <label htmlFor="delete-vendor-profile-only" className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
                  <RadioGroupItem id="delete-vendor-profile-only" value="profile_only" className="mt-1" />
                  <span>
                    <span className="block font-medium">Remove profile only</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      Keep this vendor’s quotes, job history, and reviews as historical records.
                    </span>
                  </span>
                </label>
                <label htmlFor="delete-vendor-with-records" className="flex cursor-pointer items-start gap-3 rounded-md border border-destructive/50 bg-destructive/5 p-3">
                  <RadioGroupItem id="delete-vendor-with-records" value="profile_and_related_records" className="mt-1" />
                  <span>
                    <span className="block font-medium text-destructive">Delete profile and related records</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      Permanently delete this vendor’s quotes, job history, and reviews too.
                    </span>
                  </span>
                </label>
              </RadioGroup>
              {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={deleteVendor.isPending} onClick={() => setDeleteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteVendor.isPending}
                  onClick={continueDeletion}
                >
                  {deletionMode === "profile_only" ? "Remove profile" : "Continue"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <AlertDialog
            open={confirmRelatedDelete}
            onOpenChange={(open) => {
              if (!deleteVendor.isPending) setConfirmRelatedDelete(open)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete related vendor records permanently?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes {trade.companyName}’s directory profile, quotes, job history, and reviews from this workspace. This cannot be undone. Projects, import batches, project files, invoices, and other vendors will remain.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteVendor.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleteVendor.isPending}
                  onClick={(event) => {
                    event.preventDefault()
                    setConfirmRelatedDelete(false)
                    void deleteVendorProfile("profile_and_related_records")
                  }}
                >
                  {deleteVendor.isPending ? "Deleting…" : "Delete profile and records"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  )
}
