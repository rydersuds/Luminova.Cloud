import * as React from "react"
import { useLocation, useParams } from "wouter"
import { useQueryClient } from "@tanstack/react-query"
import { AppLayout } from "@/components/layout/app-layout"
import { 
  useGetTrade, 
  getGetTradeQueryKey,
  getGetTradesQueryKey,
  useGetProjects,
  useGetCurrentWorkspaceUser,
  useCreateTradeJobHistory,
  useUpdateTradeJobHistory,
  useDeleteTradeJobHistory,
  useCreateTradeReview,
  useUpdateTradeReview,
  useDeleteTradeReview,
} from "@workspace/api-client-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  MapPin, Star, Phone, Mail, Globe, ShieldCheck, FileCheck, ArrowLeft, History, MessageSquare
} from "lucide-react"
import { cn, formatCurrency, formatDate } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

type Feedback = { kind: "success" | "error"; message: string } | null
type ErrorWithData = { data?: { error?: string }; message?: string }

const today = () => {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const errorMessage = (error: unknown, fallback: string) => {
  const typed = error as ErrorWithData
  return typed.data?.error || typed.message || fallback
}

export default function TradeDetail() {
  const params = useParams()
  const [, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const tradeId = params.id as string

  const { data: trade, isLoading } = useGetTrade(tradeId, {
    query: {
      enabled: !!tradeId,
      queryKey: getGetTradeQueryKey(tradeId)
    }
  })
  const { data: projects } = useGetProjects()
  const { data: currentUser } = useGetCurrentWorkspaceUser()
  const createJobHistory = useCreateTradeJobHistory()
  const updateJobHistory = useUpdateTradeJobHistory()
  const deleteJobHistory = useDeleteTradeJobHistory()
  const createReview = useCreateTradeReview()
  const updateReview = useUpdateTradeReview()
  const deleteReview = useDeleteTradeReview()
  const [historyDialog, setHistoryDialog] = React.useState<"create" | "edit" | null>(null)
  const [editingHistoryId, setEditingHistoryId] = React.useState<string | null>(null)
  const [reviewDialog, setReviewDialog] = React.useState(false)
  const [editReviewDialog, setEditReviewDialog] = React.useState(false)
  const [editingReviewId, setEditingReviewId] = React.useState<string | null>(null)
  const [feedback, setFeedback] = React.useState<Feedback>(null)
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
      <AppLayout>
        <div className="flex-1 p-8 flex items-center justify-center">
          <div className="animate-pulse h-12 w-12 rounded-full bg-muted" />
        </div>
      </AppLayout>
    )
  }

  if (!trade) {
    return (
      <AppLayout>
        <div className="flex-1 p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Trade profile not found</h2>
          <Button onClick={() => setLocation("/trades")}>Back to Directory</Button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-background flex flex-col">
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
              <div 
                className="h-24 w-24 shrink-0 rounded-2xl flex items-center justify-center font-heading font-bold text-3xl shadow-sm" 
                style={{ backgroundColor: `${trade.accent}15`, color: trade.accent, border: `1px solid ${trade.accent}30` }}
              >
                {trade.initials}
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-heading font-bold">{trade.companyName}</h1>
                  <Badge variant="outline" className="border-primary text-primary">{trade.tradeType}</Badge>
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
                <Button className="w-full" onClick={() => setLocation(`/quotes?vendorId=${trade.id}`)}>View Vendor Quotes</Button>
                <Button variant="outline" className="w-full gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Message
                </Button>
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
                    <span>{trade.phone}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${trade.email}`} className="text-primary hover:underline">{trade.email}</a>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a href={`https://${trade.website}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{trade.website}</a>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium mb-1">Service Regions:</p>
                      <div className="flex flex-wrap gap-1">
                        {trade.regions.map(r => <Badge key={r} variant="secondary" className="text-[10px] px-1.5 py-0">{r}</Badge>)}
                      </div>
                    </div>
                  </div>
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
                      <p className="text-muted-foreground font-mono mt-0.5">{trade.licence}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <ShieldCheck className="h-4 w-4 text-success mt-0.5" />
                    <div>
                      <p className="font-medium text-foreground">Insurance</p>
                      <p className="text-muted-foreground mt-0.5">Expires {formatDate(trade.insuranceExpiry)}</p>
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
    </AppLayout>
  )
}
