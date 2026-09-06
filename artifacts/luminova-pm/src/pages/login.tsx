import { SignIn, SignUp } from "@clerk/react"
import { useCallback, useEffect, useRef, useState } from "react"

export default function Login() {
  return (
    <AuthShell showRemember>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/intro`} />
    </AuthShell>
  )
}

export function SignUpPage() {
  return <AuthShell><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/intro`} /></AuthShell>
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "")

function AuthShell({ children, showRemember = false }: { children: React.ReactNode; showRemember?: boolean }) {
  const [remember, setRemember] = useState(() => localStorage.getItem("luminova-remember-session") !== "false")
  const introWarmed = useRef(false)
  const warmIntro = useCallback(() => {
    if (introWarmed.current) return
    introWarmed.current = true
    void fetch(`${basePath}/luminova-intro-animation.html`, { cache: "force-cache" })
  }, [])

  useEffect(() => {
    if (showRemember && !remember) {
      sessionStorage.setItem("luminova-session-window", "active")
    }
  }, [remember, showRemember])

  const updateRemember = (checked: boolean) => {
    setRemember(checked)
    localStorage.setItem("luminova-remember-session", String(checked))
    if (checked) {
      sessionStorage.removeItem("luminova-session-window")
    } else {
      sessionStorage.setItem("luminova-session-window", "active")
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black p-4"
      onPointerDownCapture={warmIntro}
      onFocusCapture={warmIntro}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(181,156,63,0.10),transparent_38%)]" />

      <div className="relative z-10 w-full max-w-md space-y-7">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="h-28 w-64 mb-2">
            <img src="/luminova-logo.png" alt="Luminova Construction" className="h-full w-full object-contain" decoding="async" />
          </div>
          <h1 className="text-3xl font-heading font-bold text-sidebar-foreground tracking-tight">Construction Operations</h1>
          <p className="text-sidebar-foreground/60 text-sm">Project management workspace</p>
        </div>

        {children}

        {showRemember && (
          <label className="mx-auto flex w-full max-w-[440px] cursor-pointer items-center gap-3 px-1 text-sm text-sidebar-foreground/75">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => updateRemember(event.target.checked)}
              className="h-4 w-4 accent-[#b59c3f]"
            />
            <span>Remember me on this device</span>
          </label>
        )}

        <p className="text-center text-xs text-sidebar-foreground/40 font-medium">
          © {new Date().getFullYear()} Luminova Construction. All rights reserved.
        </p>
      </div>
    </div>
  )
}
