import * as React from "react"
import { useLocation } from "wouter"
import { 
  useGetTrades, 
  getGetTradesQueryKey 
} from "@workspace/api-client-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { VendorIdentity } from "@/components/vendor-identity"
import { Search, MapPin, Star, ArrowRight } from "lucide-react"
import { FilterField, FilterMenu } from "@/components/filter-menu"

export default function TradesDirectory() {
  const [, setLocation] = useLocation()
  const [search, setSearch] = React.useState("")
  const [tradeType, setTradeType] = React.useState("")
  const [feedback, setFeedback] = React.useState("")

  React.useEffect(() => {
    const message = window.sessionStorage.getItem("luminova-trade-directory-feedback-v1")
    if (!message) return
    window.sessionStorage.removeItem("luminova-trade-directory-feedback-v1")
    setFeedback(message)
  }, [])

  const { data: availableTrades } = useGetTrades({}, {
    query: {
      queryKey: getGetTradesQueryKey({})
    }
  })
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
  const specialtyOptions = React.useMemo(() => Array.from(new Set(
    (availableTrades ?? trades ?? []).flatMap((trade) => trade.specialties?.length ? trade.specialties : [trade.tradeType])
  )).sort(), [availableTrades, trades])

  return (
    <>
      <div className="flex-1 overflow-x-hidden overflow-y-auto bg-transparent">
        <div className="border-b border-border bg-transparent text-foreground dark:text-sidebar-foreground">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="px-6 py-10 md:px-8 md:py-12">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-px w-6 bg-primary" />
              <span className="font-mono text-xs uppercase tracking-[0.22em] text-primary">Vendor network</span>
            </div>
            <h1 className="text-3xl font-heading font-bold md:text-4xl">Trades & Vendors Directory</h1>
            
            <div className="mt-8 flex max-w-3xl flex-col gap-4 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground dark:text-sidebar-foreground/50" />
                <Input 
                  placeholder="Search company, contact, specialty, phone, email, or notes..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-12 border-input bg-card pl-10 text-foreground placeholder:text-muted-foreground dark:border-sidebar-border dark:bg-sidebar-accent dark:text-sidebar-foreground dark:placeholder:text-sidebar-foreground/50"
                />
              </div>
              <FilterMenu activeCount={tradeType ? 1 : 0} onClear={() => setTradeType("")}>
                <FilterField label="Trade specialty">
                <select
                  value={tradeType}
                  onChange={(e) => setTradeType(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">All Trades</option>
                  {specialtyOptions.map((specialty) => <option key={specialty} value={specialty}>{specialty}</option>)}
                </select>
                </FilterField>
              </FilterMenu>
            </div>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 max-w-5xl mx-auto">
          {feedback && (
            <div role="status" className="mb-6 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
              {feedback}
            </div>
          )}
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
                      <VendorIdentity
                        vendorId={trade.id}
                        name={trade.companyName}
                        initials={trade.initials}
                        accent={trade.accent}
                        logoUrl={trade.profilePhotoUrl}
                        positionX={trade.profilePhotoPositionX ?? 50}
                        positionY={trade.profilePhotoPositionY ?? 50}
                        zoom={trade.profilePhotoZoom ?? 1}
                        className="h-16 w-16 text-xl"
                      />
                      
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words text-lg font-heading font-semibold">{trade.companyName}</h3>
                          {(trade.specialties?.length ? trade.specialties : [trade.tradeType]).map((specialty) => (
                            <Badge key={specialty} variant="secondary" className="font-normal text-xs">{specialty}</Badge>
                          ))}
                        </div>
                        <p className="text-sm text-muted-foreground">{trade.contactName}</p>
                        
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
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
    </>
  )
}
