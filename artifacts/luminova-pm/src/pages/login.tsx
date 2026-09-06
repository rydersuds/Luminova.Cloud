import { SignUp, useSignIn } from "@clerk/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useLocation } from "wouter"

export default function Login() {
  const { signIn, fetchStatus } = useSignIn()
  const [, setLocation] = useLocation()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    const result = await signIn.create({ identifier: identifier.trim(), password })
    if (result.error) {
      setError(result.error.longMessage || result.error.message || "Unable to sign in. Check your details and try again.")
      return
    }
    if (signIn.status !== "complete") {
      setError("This account requires an additional verification step. Please contact an administrator.")
      return
    }
    await signIn.finalize()
    setLocation("/intro", { replace: true })
  }

  return (
    <AuthShell showRemember>
      <form onSubmit={submit} className="mx-auto w-full max-w-[440px] border border-white/15 bg-[#202020] px-8 py-8 text-white shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
        <div className="mb-7 text-center">
          <h2 className="text-xl font-semibold">Sign in to Luminova Construction PM</h2>
          <p className="mt-1 text-sm text-white/55">Enter your account details to continue</p>
        </div>

        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Email or username</span>
            <input
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              required
              className="h-11 w-full border border-white/15 bg-[#292929] px-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#b59c3f]"
              placeholder="Enter your email or username"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="h-11 w-full border border-white/15 bg-[#292929] px-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#b59c3f]"
              placeholder="Enter your password"
            />
          </label>
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={fetchStatus === "fetching"}
          className="mt-6 flex h-11 w-full items-center justify-center bg-[#b59c3f] font-semibold text-black transition-colors hover:bg-[#c8ae4b] disabled:cursor-wait disabled:opacity-60"
        >
          {fetchStatus === "fetching" ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-6 text-center text-sm text-white/55">
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="text-[#c8ae4b] hover:text-[#dac56c]">Sign up</Link>
        </p>
      </form>
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
    void fetch(`${basePath}/luminova-intro-animation.html?v=6`, { cache: "force-cache" })
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
