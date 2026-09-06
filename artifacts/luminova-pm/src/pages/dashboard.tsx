import * as React from "react"
import {
  useGetDashboardSummary,
  useGetProjects,
  useCreateProject,
  getGetProjectsQueryKey,
  getGetDashboardSummaryQueryKey
} from "@workspace/api-client-react"
import { AppLayout } from "@/components/layout/app-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils"
import { Plus, Search, MapPin, Building, ChevronRight, Activity, Camera, DollarSign, Clock } from "lucide-react"
import { Link, useLocation } from "wouter"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useQueryClient } from "@tanstack/react-query"
import { Textarea } from "@/components/ui/textarea"

export default function Dashboard() {
  const [, setLocation] = useLocation()
  const [search, setSearch] = React.useState("")
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const queryClient = useQueryClient()
  
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    query: {
      queryKey: getGetDashboardSummaryQueryKey()
    }
  })
  
  const { data: projects, isLoading: loadingProjects } = useGetProjects(
    { search: search || undefined },
    {
      query: {
        queryKey: getGetProjectsQueryKey({ search: search || undefined }),
      }
    }
  )

  const createProject = useCreateProject()
  
  const handleCreateProject = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    createProject.mutate({
      data: {
        name: formData.get("name") as string,
        address: formData.get("address") as string,
        region: formData.get("region") as string,
        pmName: "Current User", // Demo value
        clientName: formData.get("clientName") as string,
        targetDate: formData.get("targetDate") as string,
        budgeted: Number(formData.get("budgeted")),
        status: "Active",
        description: formData.get("description") as string,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectsQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })
        setIsCreateOpen(false)
      }
    })
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto bg-background">
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-heading font-bold text-foreground">Overview</h1>
              <p className="text-muted-foreground mt-1 text-sm">Welcome back. Here's what's happening across your sites today.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search projects..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-[250px] bg-card"
                />
              </div>
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    New Project
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Project</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateProject} className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Project Name</Label>
                      <Input id="name" name="name" required placeholder="e.g. 100 Main St Renovation" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="clientName">Client Name</Label>
                        <Input id="clientName" name="clientName" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="region">Region</Label>
                        <Input id="region" name="region" required placeholder="e.g. Downtown" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Address</Label>
                      <Input id="address" name="address" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="targetDate">Target Date</Label>
                        <Input id="targetDate" name="targetDate" type="date" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="budgeted">Budget ($)</Label>
                        <Input id="budgeted" name="budgeted" type="number" required />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea id="description" name="description" />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createProject.isPending}>
                        {createProject.isPending ? "Creating..." : "Create Project"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Active Projects</p>
                    <p className="text-2xl font-bold">{loadingSummary ? "-" : summary?.activeProjects}</p>
                  </div>
                  <div className="h-10 w-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                    <Building className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Awaiting Approval</p>
                    <p className="text-2xl font-bold">{loadingSummary ? "-" : summary?.awaitingApproval}</p>
                  </div>
                  <div className="h-10 w-10 bg-warning/10 text-warning rounded-full flex items-center justify-center">
                    <Clock className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">New 360 Photos</p>
                    <p className="text-2xl font-bold">{loadingSummary ? "-" : summary?.new360Photos}</p>
                  </div>
                  <div className="h-10 w-10 bg-info/10 text-info rounded-full flex items-center justify-center">
                    <Camera className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Total Budgeted</p>
                    <p className="text-2xl font-bold tabular-nums">
                      {loadingSummary ? "-" : `$${((summary?.budgeted || 0) / 1000000).toFixed(1)}M`}
                    </p>
                  </div>
                  <div className="h-10 w-10 bg-success/10 text-success rounded-full flex items-center justify-center">
                    <DollarSign className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-heading font-semibold">Active Projects</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {loadingProjects ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="h-64 animate-pulse bg-muted" />
                  ))
                ) : projects?.length === 0 ? (
                  <div className="col-span-2 text-center py-12 bg-card rounded-lg border border-border">
                    <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground">No projects found</h3>
                    <p className="text-muted-foreground">Try adjusting your filters or create a new project.</p>
                  </div>
                ) : projects?.map((project) => (
                  <Card key={project.id} className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer group flex flex-col" onClick={() => setLocation(`/projects/${project.id}`)}>
                    <div className="h-32 bg-muted relative overflow-hidden">
                      {project.exteriorImage ? (
                        <img src={project.exteriorImage} alt={project.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-sidebar text-sidebar-foreground/20">
                          <Building className="h-12 w-12" />
                        </div>
                      )}
                      <div className="absolute top-3 left-3 flex gap-2">
                        <Badge variant={getStatusColor(project.status) as any} className="capitalize">
                          {project.status}
                        </Badge>
                      </div>
                    </div>
                    <CardContent className="p-4 flex-1 flex flex-col">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-heading font-semibold text-lg line-clamp-1">{project.name}</h3>
                      </div>
                      <div className="space-y-2 mt-auto">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          <span className="truncate">{project.address}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-medium">{project.progress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-heading font-semibold">Recent Activity</h2>
              <Card>
                <CardContent className="p-0 divide-y divide-border">
                  {loadingSummary ? (
                    <div className="p-6 text-center text-muted-foreground">Loading activity...</div>
                  ) : summary?.recentActivity.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground">No recent activity.</div>
                  ) : summary?.recentActivity.map((activity) => (
                    <div key={activity.id} className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex gap-3">
                        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                          <Activity className="h-4 w-4 text-secondary-foreground" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium leading-snug">
                            {activity.title}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {activity.description}
                          </p>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs font-medium text-foreground">{activity.author}</span>
                            <span className="text-xs text-muted-foreground">{formatDate(activity.date)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Link href="/messages" className="block p-3 text-center text-sm font-medium text-primary hover:bg-muted/50 transition-colors">
                    View all activity
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
