import { SignIn, SignUp } from "@clerk/react"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Link } from "wouter"
import { LEGAL_CONSENT_LABEL, PRIVACY_PATH, TERMS_PATH } from "@/lib/legal-consent"

export default function Login() {
  const [consentGranted, setConsentGranted] = useState(
    () => sessionStorage.getItem("luminova-legal-consent") === "accepted",
  )
  const [consentAccepted, setConsentAccepted] = useState(false)

  const continueToSignIn = (event: FormEvent) => {
    event.preventDefault()
    if (!consentAccepted) return
    sessionStorage.setItem("luminova-legal-consent", "accepted")
    setConsentGranted(true)
  }

  if (consentGranted) {
    return (
      <AuthShell showRemember>
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          forceRedirectUrl={`${basePath}/intro`}
        />
      </AuthShell>
    )
  }

  return (
    <AuthShell showRemember>
      <form onSubmit={continueToSignIn} className="surface-3d mx-auto w-full max-w-[440px] border-sidebar-border bg-sidebar-accent/55 px-7 py-8 text-sidebar-foreground shadow-2xl sm:px-8">
        <div className="mb-7 text-center">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[.2em] text-primary">Access protocol</p>
          <h2 className="text-xl font-semibold">Continue to secure sign in</h2>
          <p className="mt-1 text-sm text-sidebar-foreground/55">Review and accept the workspace policies first</p>
        </div>

        <div className="flex items-start gap-3">
          <input
            id="legal-consent"
            type="checkbox"
            checked={consentAccepted}
            onChange={(event) => setConsentAccepted(event.target.checked)}
            required
            aria-describedby="legal-consent-description"
            className="mt-1 h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar-accent"
          />
          <label id="legal-consent-description" htmlFor="legal-consent" className="text-sm leading-6 text-sidebar-foreground/75">
            {LEGAL_CONSENT_LABEL.split("Terms & Conditions")[0]}
            <Link href={TERMS_PATH} target="_blank" rel="noreferrer" className="font-semibold text-primary underline underline-offset-2 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Terms &amp; Conditions
            </Link>
            {" and acknowledge the "}
            <Link href={PRIVACY_PATH} target="_blank" rel="noreferrer" className="font-semibold text-primary underline underline-offset-2 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Privacy Policy
            </Link>
            .
          </label>
        </div>

        <button
          type="submit"
          disabled={!consentAccepted}
          className="tech-clip mt-6 flex h-11 w-full items-center justify-center bg-primary font-semibold text-primary-foreground transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue to sign in
        </button>
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
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-sidebar bg-tech-grid-soft p-4"
      onPointerDownCapture={warmIntro}
      onFocusCapture={warmIntro}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,hsl(var(--primary)/0.14),transparent_38%),radial-gradient(circle_at_10%_90%,hsl(var(--accent)/0.10),transparent_34%)]" />

      <div className="relative z-10 w-full max-w-md space-y-7">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="h-28 w-64 mb-2">
            <img src="/luminova-logo.png" alt="Luminova Construction" className="h-full w-full object-contain" decoding="async" />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[.26em] text-primary">Secure construction operations</p>
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
              className="h-4 w-4 accent-primary"
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
