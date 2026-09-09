import * as React from "react"
import { useLocation } from "wouter"
import { AppLayout } from "@/components/layout/app-layout"
import { 
  useGetTrades, 
  getGetTradesQueryKey 
} from "@workspace/api-client-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Search, MapPin, Star, Filter, ArrowRight } from "lucide-react"

export default function TradesDirectory() {
  const [, setLocation] = useLocation()
  const [search, setSearch] = React.useState("")
  const [tradeType, setTradeType] = React.useState("")

  const { data: trades, isLoading } = useGetTrades({ 
    search: search || undefined,
    tradeType: tradeType || undefined
  }, {
    query: {
      queryKey: getGetTradesQueryKey({ 
        search: search || undefined,
        tradeType: tradeType || undefined
      })
    }
  })

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-transparent">
        <div className="border-b border-border bg-transparent text-foreground dark:text-sidebar-foreground">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="px-6 py-10 md:px-8 md:py-12">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-px w-6 bg-primary" />
              <span className="font-mono text-xs uppercase tracking-[0.22em] text-primary">Vendor network</span>
            </div>
            <h1 className="text-3xl font-heading font-bold md:text-4xl">Trades & Vendors Directory</h1>
            <p className="mt-2 max-w-2xl text-base text-muted-foreground dark:text-sidebar-foreground/70 md:text-lg">
              Find, evaluate, and manage subcontractors across all regions. Review past performance before requesting bids.
            </p>
            
            <div className="mt-8 flex max-w-3xl flex-col gap-4 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground dark:text-sidebar-foreground/50" />
                <Input 
                  placeholder="Search by company or contact name..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-12 border-input bg-card pl-10 text-foreground placeholder:text-muted-foreground dark:border-sidebar-border dark:bg-sidebar-accent dark:text-sidebar-foreground dark:placeholder:text-sidebar-foreground/50"
                />
              </div>
              <div className="relative w-full sm:w-64">
                <Filter className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground dark:text-sidebar-foreground/50" />
                <select
                  value={tradeType}
                  onChange={(e) => setTradeType(e.target.value)}
                  className="h-12 w-full appearance-none rounded-md border border-input bg-card pl-10 pr-4 text-foreground focus:outline-none focus:ring-1 focus:ring-ring dark:border-sidebar-border dark:bg-sidebar-accent dark:text-sidebar-foreground dark:focus:ring-sidebar-primary"
                >
                  <option value="">All Trades</option>
                  <option value="Electrical">Electrical</option>
                  <option value="Plumbing">Plumbing</option>
                  <option value="HVAC">HVAC</option>
                  <option value="Carpentry">Carpentry</option>
                  <option value="Concrete">Concrete</option>
                </select>
              </div>
            </div>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 max-w-5xl mx-auto">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} className="h-24 animate-pulse bg-muted" />
              ))}
            </div>
          ) : trades?.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-lg border border-border">
              <h3 className="text-xl font-heading font-medium">No trades found</h3>
              <p className="text-muted-foreground mt-2">Try adjusting your search filters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {trades?.map((trade) => (
                <Card key={trade.id} className="overflow-hidden hover:shadow-md transition-all group border-border cursor-pointer" onClick={() => setLocation(`/trades/${trade.id}`)}>
                  <CardContent className="p-0">
                    <div className="flex flex-col sm:flex-row sm:items-center p-4 sm:p-6 gap-4 sm:gap-6">
                      <div 
                        className="h-16 w-16 shrink-0 overflow-hidden rounded-xl flex items-center justify-center font-heading font-bold text-xl shadow-inner"
                        style={{ backgroundColor: `${trade.accent}15`, color: trade.accent, border: `1px solid ${trade.accent}30` }}
                      >
                        {trade.profilePhotoUrl
                            ? <img
                                src={trade.profilePhotoUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                style={{
                                  objectPosition: `${trade.profilePhotoPositionX ?? 50}% ${trade.profilePhotoPositionY ?? 50}%`,
                                  transform: `scale(${trade.profilePhotoZoom ?? 1})`,
                                  transformOrigin: `${trade.profilePhotoPositionX ?? 50}% ${trade.profilePhotoPositionY ?? 50}%`,
                                }}
                              />
                          : trade.initials}
                      </div>
                      
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-heading font-semibold">{trade.companyName}</h3>
                          <Badge variant="secondary" className="font-normal text-xs">{trade.tradeType}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{trade.contactName}</p>
                        
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" />
                            {trade.region}
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            {trade.reviewCount > 0 ? (
                              <>
                                <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                                <span className="font-medium text-foreground">{trade.rating.toFixed(1)}</span>
                                <span>({trade.reviewCount} verified)</span>
                              </>
                            ) : (
                              <span>No verified reviews</span>
                            )}
                          </div>
                          <div className="text-muted-foreground hidden sm:block">
                            • {trade.completedJobs} jobs completed
                          </div>
                        </div>
                      </div>
                      
                      <div className="shrink-0 pt-2 sm:pt-0 flex items-center">
                        <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
