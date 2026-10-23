import * as React from "react"
import { Link } from "wouter"
import { useGetTrades, getGetTradesQueryKey } from "@workspace/api-client-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VendorIdentity } from "@/components/vendor-identity"
import { Search, MapPin, Phone, Mail, X } from "lucide-react"
import { FilterField, FilterMenu } from "@/components/filter-menu"

const rowLayout = "grid min-w-0 gap-x-4 gap-y-2 @min-[880px]:grid-cols-[1.5fr_1fr_0.9fr_1.6fr_0.8fr] @min-[880px]:items-center"
const contactLink = "flex min-h-11 min-w-0 items-center gap-2 rounded-sm text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 @min-[880px]:min-h-8"

export default function TradesDirectory() {
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
    query: { queryKey: getGetTradesQueryKey({}), retry: false }
  })
  const { data: trades, isLoading, isError, isFetching, refetch } = useGetTrades({
    search: search || undefined,
    tradeType: tradeType || undefined
  }, {
    query: {
      queryKey: getGetTradesQueryKey({
        search: search || undefined,
        tradeType: tradeType || undefined
      }),
      retry: false,
    }
  })
  const specialtyOptions = React.useMemo(() => Array.from(new Set(
    (availableTrades ?? trades ?? []).flatMap((trade) => trade.specialties?.length ? trade.specialties : [trade.tradeType])
  )).sort(), [availableTrades, trades])
  const hasFilters = Boolean(search || tradeType)
  const clearAll = () => { setSearch(""); setTradeType("") }

  return (
    <div className="min-w-0 flex-1 bg-transparent">
      <div className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-5 md:px-8 md:py-6">
          <h1 className="font-heading text-2xl font-bold md:text-3xl">Trades &amp; Vendors Directory</h1>
          <div className="mt-4 flex items-center gap-3 [&>button]:min-h-11">
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search vendors"
                data-testid="input-vendor-search"
                placeholder="Search vendors…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 bg-card pl-9"
              />
            </div>
            <FilterMenu activeCount={tradeType ? 1 : 0} onClear={() => setTradeType("")}>
              <FilterField label="Trade specialty">
                <select
                  value={tradeType}
                  data-testid="select-vendor-specialty"
                  onChange={(event) => setTradeType(event.target.value)}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">All Trades</option>
                  {specialtyOptions.map((specialty) => <option key={specialty} value={specialty}>{specialty}</option>)}
                </select>
              </FilterField>
            </FilterMenu>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-6 pt-3 md:px-8">
        {feedback && <div role="status" data-testid="status-vendor-feedback" className="mb-3 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">{feedback}</div>}
        <div className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p aria-live="polite" data-testid="text-vendor-count" className="text-sm text-muted-foreground">
            {isLoading ? "Loading vendors…" : isError ? "Vendors unavailable" : `${trades?.length ?? 0} ${(trades?.length ?? 0) === 1 ? "vendor" : "vendors"}${hasFilters ? " found" : ""}`}
          </p>
          {tradeType && (
            <Button variant="outline" data-testid="button-clear-specialty" className="h-auto min-h-11 max-w-full gap-2 whitespace-normal text-left" onClick={() => setTradeType("")} aria-label={`Clear specialty filter: ${tradeType}`}>
              <span className="min-w-0 break-words">Specialty: {tradeType}</span>
              <X aria-hidden="true" className="h-4 w-4 shrink-0" />
            </Button>
          )}
        </div>
        {isLoading ? (
          <div aria-label="Loading vendors" aria-busy="true" className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-md border border-border bg-muted" />)}
          </div>
        ) : isError ? (
          <div role="alert" className="rounded-lg border border-border bg-card p-6 text-center">
            <h2 className="font-heading text-lg font-semibold">Unable to load vendors</h2>
            <p className="mt-1 text-sm text-muted-foreground">Try again to load the directory.</p>
            <Button variant="outline" data-testid="button-retry-vendors" className="mt-4 min-h-11" disabled={isFetching} onClick={() => void refetch()}>Retry</Button>
          </div>
        ) : trades?.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <h2 className="font-heading text-lg font-semibold">{hasFilters ? "No matching vendors" : "No vendors yet"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{hasFilters ? "Try another search or clear your filters." : "Vendors will appear here when available."}</p>
            {hasFilters && <Button variant="outline" data-testid="button-clear-vendor-search-filters" className="mt-4 min-h-11" onClick={clearAll}>Clear search and filters</Button>}
          </div>
        ) : (
          <div className="@container rounded-lg border border-border bg-card">
            <div aria-hidden="true" className={`${rowLayout} hidden border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground @min-[880px]:grid`}>
              <span>Company</span><span>Specialties</span><span>Contact</span><span>Phone / Email</span><span>Location</span>
            </div>
            <ul aria-label="Vendors" className="divide-y divide-border">
              {trades?.map((trade) => {
                const phone = trade.phone?.trim()
                const email = trade.email?.trim()
                return (
                  <li key={trade.id} data-testid={`row-vendor-${trade.id}`} className={`${rowLayout} px-4 py-3 text-sm`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <VendorIdentity
                        vendorId={trade.id}
                        name={trade.companyName}
                        initials={trade.initials}
                        accent={trade.accent}
                        logoUrl={trade.profilePhotoUrl}
                        positionX={trade.profilePhotoPositionX ?? 50}
                        positionY={trade.profilePhotoPositionY ?? 50}
                        zoom={trade.profilePhotoZoom ?? 1}
                        className="h-11 w-11 text-base"
                      />
                      <h2 className="min-w-0 font-heading font-semibold">
                        <Link href={`/trades/${trade.id}`} data-testid={`link-vendor-profile-${trade.id}`} className="flex min-h-11 items-center rounded-sm [overflow-wrap:anywhere] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                          {trade.companyName}
                        </Link>
                      </h2>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-1">
                      <span className="sr-only">Specialties: </span>
                      {(trade.specialties?.length ? trade.specialties : [trade.tradeType]).map((specialty) => (
                        <Badge key={specialty} variant="secondary" className="max-w-full whitespace-normal [overflow-wrap:anywhere] text-xs font-normal">{specialty}</Badge>
                      ))}
                    </div>
                    <p className="min-w-0 [overflow-wrap:anywhere]"><span className="text-muted-foreground @min-[880px]:sr-only">Contact: </span><span className={trade.contactName?.trim() ? undefined : "text-muted-foreground"}>{trade.contactName?.trim() || "Not recorded"}</span></p>
                    <div className="min-w-0">
                      {phone ? (
                        <a data-testid={`link-vendor-phone-${trade.id}`} className={contactLink} href={`tel:${phone}`} aria-label={`Call ${trade.companyName} at ${phone}`}>
                          <Phone aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 [overflow-wrap:anywhere]">{phone}</span>
                        </a>
                      ) : <p className="flex min-h-8 items-center gap-2 text-muted-foreground"><Phone aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />Phone not recorded</p>}
                      {email ? (
                        <a data-testid={`link-vendor-email-${trade.id}`} className={contactLink} href={`mailto:${email}`} aria-label={`Email ${trade.companyName} at ${email}`}>
                          <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 [overflow-wrap:anywhere]">{email}</span>
                        </a>
                      ) : <p className="flex min-h-8 items-center gap-2 text-muted-foreground"><Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />Email not recorded</p>}
                    </div>
                    <p className="flex min-w-0 items-start gap-1.5 text-muted-foreground">
                      <MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]"><span className="sr-only">Location: </span><span>{trade.region?.trim() || "Not recorded"}</span></span>
                    </p>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
