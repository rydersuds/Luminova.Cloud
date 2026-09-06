import { SignIn, SignUp } from "@clerk/react"

export default function Login() {
  return <AuthShell><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/intro`} /></AuthShell>
}

export function SignUpPage() {
  return <AuthShell><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/intro`} /></AuthShell>
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "")

function AuthShell({ children }: { children: React.ReactNode }) {
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
            <img src="/luminova-logo.png" alt="Luminova Construction" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-3xl font-heading font-bold text-sidebar-foreground tracking-tight">Construction Operations</h1>
          <p className="text-sidebar-foreground/60 text-sm">Project management workspace</p>
        </div>

        {children}

        <p className="text-center text-xs text-sidebar-foreground/40 font-medium">
          © {new Date().getFullYear()} Luminova Construction. All rights reserved.
        </p>
      </div>
    </div>
  )
}
