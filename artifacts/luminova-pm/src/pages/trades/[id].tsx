import * as React from "react"
import { useLocation, useParams } from "wouter"
import { AppLayout } from "@/components/layout/app-layout"
import { 
  useGetTrade, 
  getGetTradeQueryKey 
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

export default function TradeDetail() {
  const params = useParams()
  const [, setLocation] = useLocation()
  const tradeId = params.id as string

  const { data: trade, isLoading } = useGetTrade(tradeId, {
    query: {
      enabled: !!tradeId,
      queryKey: getGetTradeQueryKey(tradeId)
    }
  })

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
                <TabsList className="w-full justify-start border-b border-border rounded-none bg-transparent p-0 mb-6">
                  <TabsTrigger value="history" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2">Job History</TabsTrigger>
                  <TabsTrigger value="bids" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2">Recent Bids</TabsTrigger>
                  <TabsTrigger value="reviews" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2">Reviews</TabsTrigger>
                </TabsList>

                <TabsContent value="history" className="mt-0">
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Project</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Contract Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trade.jobHistory.length > 0 ? trade.jobHistory.map((job, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{job.projectName}</TableCell>
                              <TableCell>{formatDate(job.date)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(job.amount)}</TableCell>
                            </TableRow>
                          )) : (
                            <TableRow>
                              <TableCell colSpan={3} className="h-24 text-center">
                                <p className="font-medium">No verified job history</p>
                                <p className="mt-1 text-sm text-muted-foreground">Completed work will appear after a real vendor invoice is linked to a project.</p>
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
                  {trade.reviews.length > 0 ? trade.reviews.map((review, i) => (
                    <Card key={i}>
                      <CardContent className="p-5 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-foreground">{review.projectName}</p>
                            <p className="text-xs text-muted-foreground">Reviewed by {review.reviewer} • {formatDate(review.date)}</p>
                          </div>
                          <div className="flex gap-1">
                            {Array.from({ length: 5 }).map((_, j) => (
                              <Star key={j} className={cn("h-4 w-4", j < review.rating ? "fill-primary text-primary" : "fill-muted text-muted")} />
                            ))}
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
    </AppLayout>
  )
}
