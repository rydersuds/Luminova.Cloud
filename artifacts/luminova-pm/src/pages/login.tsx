import { Link, useLocation } from "wouter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"

export default function Login() {
  const [, setLocation] = useLocation()

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setLocation("/")
  }

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-sidebar-primary rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-sidebar-ring rounded-full blur-[100px] mix-blend-screen" />
      </div>

      <div className="w-full max-w-md relative z-10 space-y-8">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="h-28 w-64 mb-2">
            <img src="/luminova-logo.avif" alt="Luminova Construction" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-3xl font-heading font-bold text-sidebar-foreground tracking-tight">Construction Operations</h1>
          <p className="text-sidebar-foreground/60 text-sm">Project management workspace</p>
        </div>

        <Card className="border-sidebar-border bg-sidebar-accent/50 backdrop-blur-xl shadow-2xl">
          <CardContent className="p-8">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sidebar-foreground/80">Email address</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="pm@luminova.build" 
                  required
                  className="bg-sidebar border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus-visible:ring-sidebar-primary h-11"
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password" className="text-sidebar-foreground/80">Password</Label>
                  <a href="#" className="text-xs font-medium text-sidebar-primary hover:text-sidebar-primary/80 transition-colors">Forgot password?</a>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="••••••••" 
                  required
                  className="bg-sidebar border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus-visible:ring-sidebar-primary h-11"
                />
              </div>

              <Button type="submit" className="w-full h-11 font-semibold text-base">
                Sign in to workspace
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-sidebar-foreground/40 font-medium">
          © {new Date().getFullYear()} Luminova Construction. All rights reserved.
        </p>
      </div>
    </div>
  )
}
