import { lazy, Suspense, type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppLayout, AppLayoutView } from '@/components/layout/app-layout';
import { ClerkProvider, Show, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ProjectFolderImportProvider, useProjectFolderImport } from '@/providers/project-folder-import-provider';
import { canPreloadPrimaryPages, isWorkspacePath, pageModules, preloadPrimaryPages } from '@/lib/page-preload';
import { useIsMobile } from '@/hooks/use-mobile';

import {
  Route,
  Switch,
  Redirect,
  Link,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const NotFound = lazy(() => import('@/pages/not-found'));
const Login = lazy(() => import('@/pages/login'));
const Dashboard = lazy(pageModules.dashboard);
const MobileOverview = lazy(pageModules.mobileOverview);
const DemoWorkspace = lazy(() => import('@/pages/demo-workspace'));
const ProjectDetail = lazy(pageModules.projectDetail);
const Projects = lazy(pageModules.projects);
const TradesDirectory = lazy(pageModules.trades);
const TradeDetail = lazy(pageModules.tradeDetail);
const Invoices = lazy(pageModules.invoices);
const Users = lazy(pageModules.users);
const Quotes = lazy(pageModules.quotes);
const Profile = lazy(pageModules.profile);
const Schedule = lazy(pageModules.schedule);
const Approvals = lazy(pageModules.approvals);
const SignUpPage = lazy(() => import('@/pages/login').then(({ SignUpPage }) => ({ default: SignUpPage })));
const PrivacyPage = lazy(() => import('@/pages/legal').then(({ PrivacyPage }) => ({ default: PrivacyPage })));
const TermsPage = lazy(() => import('@/pages/legal').then(({ TermsPage }) => ({ default: TermsPage })));

function PageFallback() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background text-muted-foreground">
      <p className="font-mono text-xs uppercase tracking-[0.2em]">Loading workspace…</p>
    </main>
  );
}

function WorkspacePageFallback() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-64 flex-1 items-center justify-center text-muted-foreground"
    >
      <p className="font-mono text-xs uppercase tracking-[0.2em]">Loading page…</p>
    </section>
  );
}

function Protected({ children }: { children: ReactNode }) {
  return <>
    <Show when="signed-in">{children}</Show>
    <Show when="signed-out"><Redirect to="/sign-in" /></Show>
  </>;
}

function Home() {
  return (
    <main className="relative flex min-h-[100dvh] items-center overflow-hidden bg-sidebar bg-tech-grid-soft px-5 py-8 text-sidebar-foreground sm:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,hsl(var(--accent)/0.16),transparent_34%),radial-gradient(circle_at_86%_78%,hsl(var(--primary)/0.14),transparent_32%)]" />
      <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <div className="mb-12 flex items-center gap-3">
            <span className="h-px w-10 bg-primary" />
            <span className="font-mono text-[10px] uppercase tracking-[.28em] text-sidebar-foreground/60">Luminova / secure workspace</span>
          </div>
          <img src="/luminova-logo.png" alt="Luminova Construction" className="mb-10 h-20 w-64 object-contain object-left" />
          <p className="font-mono text-xs uppercase tracking-[.24em] text-primary">Secure construction operations</p>
          <h1 className="mt-5 max-w-2xl text-5xl font-extrabold leading-[0.98] tracking-[-0.04em] sm:text-7xl">Build with complete visibility.</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-sidebar-foreground/65">A precise command center for live projects, field documentation, schedules, budgets, invoices, and vendors.</p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/sign-in" className="tech-clip gold-glow inline-flex h-12 items-center justify-center bg-primary px-8 font-bold text-primary-foreground transition-transform hover:-translate-y-0.5">Sign in</Link>
            <a href={`${basePath}/demo`} data-testid="link-public-demo" className="inline-flex h-12 items-center justify-center border border-primary/50 px-8 font-bold text-sidebar-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary">Explore interactive demo</a>
            <span className="font-mono text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/45">Authorized teams only</span>
          </div>
          <div className="mt-16 flex flex-wrap gap-x-8 gap-y-3 border-t border-sidebar-border/70 pt-5 font-mono text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/45">
            <Link href="/terms" className="transition-colors hover:text-primary">Terms &amp; conditions</Link>
            <Link href="/privacy" className="transition-colors hover:text-primary">Privacy policy</Link>
          </div>
        </div>
        <div className="relative hidden lg:block">
          <div className="surface-3d tech-clip border-sidebar-border bg-sidebar-accent/45 p-5 shadow-2xl" style={{ "--surface-light-color": "hsl(var(--primary) / 0.10)" } as CSSProperties}>
            <div className="flex items-center justify-between border-b border-sidebar-border/70 pb-4">
              <span className="font-mono text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/55">Workspace modules (illustrative)</span>
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.16em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Preview</span>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden border border-sidebar-border/60 bg-sidebar-border/60">
              {["Projects", "Field records", "Financials", "Project partners"].map((label, index) => (
                <div key={label} className="bg-sidebar/75 p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[.14em] text-sidebar-foreground/45">{label}</p>
                  <p className="mt-3 font-heading text-2xl font-bold text-sidebar-foreground">{["Sites", "360° photos", "Budgets", "Partners"][index]}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-3 border border-sidebar-border/60 bg-sidebar/55 p-4">
              <span className="h-8 w-8 border border-primary/50 bg-primary/10" />
              <div className="min-w-0 flex-1">
                <div className="mb-2 h-2 w-4/5 rounded-full bg-sidebar-foreground/20" />
                <div className="h-1.5 w-3/5 rounded-full bg-primary/55" />
              </div>
              <span className="font-mono text-[10px] text-primary">SAMPLE</span>
            </div>
          </div>
          <div className="absolute -bottom-8 -left-8 h-24 w-24 border-l border-b border-primary/50" />
        </div>
      </div>
    </main>
  );
}

function Intro() {
  const [, setLocation] = useLocation();
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onReady = (event: MessageEvent) => {
      if (event.source === frameRef.current?.contentWindow && event.data?.type === "luminova-intro-ready") {
        setReady(true);
      }
    };
    window.addEventListener("message", onReady);
    const fadeTimer = window.setTimeout(() => setLeaving(true), 3500);
    const routeTimer = window.setTimeout(() => setLocation("/", { replace: true }), 4000);
    return () => {
      window.removeEventListener("message", onReady);
      window.clearTimeout(fadeTimer);
      window.clearTimeout(routeTimer);
    };
  }, [setLocation]);

  return (
    <div className={`fixed inset-0 z-[100] bg-black transition-opacity duration-500 ${leaving ? "opacity-0" : "opacity-100"}`}>
      <iframe
        ref={frameRef}
        src={`${basePath}/luminova-intro-animation.html?v=6`}
        title="Luminova Construction introduction"
        className={`h-full w-full border-0 bg-black transition-opacity duration-150 ${ready ? "opacity-100" : "opacity-0"}`}
        allow="autoplay"
      />
    </div>
  );
}

function MobileOnlyQuickView() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileOverview /> : <Redirect to="/" />;
}

function AuthenticatedRoutes() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/mobile" component={MobileOnlyQuickView} />
        <Route path="/projects/:id"><ProjectDetail /></Route>
        <Route path="/projects" component={Projects} />
        <Route path="/schedule" component={Schedule} />
        <Route path="/approvals" component={Approvals} />
        <Route path="/trades" component={TradesDirectory} />
        <Route path="/trades/:id" component={TradeDetail} />
        <Route path="/invoices" component={Invoices} />
        <Route path="/quotes" component={Quotes} />
        <Route path="/users" component={Users} />
        <Route path="/profile" component={Profile} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function AuthenticatedWorkspace() {
  const [location] = useLocation();
  return (
    <AppLayout>
      <Suspense fallback={<WorkspacePageFallback />}>
        {/* Keyed on the route so each page plays its entrance animation. */}
        <div key={location} className="page-enter min-w-0">
          <AuthenticatedRoutes />
        </div>
      </Suspense>
    </AppLayout>
  );
}

function WorkspaceOrHome() {
  const [location] = useLocation();

  return (
    <>
      <Show when="signed-in"><AuthenticatedWorkspace /></Show>
      <Show when="signed-out">
        {location === "/" ? <Home /> : <Redirect to="/sign-in" />}
      </Show>
    </>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/sign-in/*?" component={Login} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/login" component={Login} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/intro"><Protected><Intro /></Protected></Route>
        <Route><WorkspaceOrHome /></Route>
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function SessionPolicy() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const remembered = localStorage.getItem("luminova-remember-session") !== "false";
    const activeWindow = sessionStorage.getItem("luminova-session-window") === "active";
    if (!remembered && !activeWindow) {
      void signOut({ redirectUrl: import.meta.env.BASE_URL });
    }
  }, [isLoaded, isSignedIn, signOut]);

  return null;
}

function AuthenticatedPagePreloader() {
  const { isLoaded, isSignedIn } = useAuth();
  const [location] = useLocation();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !isWorkspacePath(location) || !canPreloadPrimaryPages()) return;

    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const preload = () => {
      if (cancelled || !canPreloadPrimaryPages()) return;
      preloadPrimaryPages(location);
    };
    const schedulePreload = () => {
      if (cancelled) return;
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(preload, { timeout: 5000 });
        return;
      }
      timeoutId = setTimeout(preload, 1000);
    };

    // Let the active route's module, data, and critical images win before
    // starting speculative page chunk requests.
    if (document.readyState === "complete") {
      schedulePreload();
    } else {
      window.addEventListener("load", schedulePreload, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", schedulePreload);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [isLoaded, isSignedIn, location]);

  return null;
}

function App() {
  const currentPath = basePath && window.location.pathname.startsWith(basePath)
    ? window.location.pathname.slice(basePath.length) || "/"
    : window.location.pathname;

  // Keep the public sandbox outside Clerk and the authenticated folder-import
  // provider so opening it cannot restore, upload, or mutate a real import.
  if (currentPath === "/demo") {
    return (
      <WouterRouter base={basePath}>
        <Suspense fallback={<PageFallback />}><DemoWorkspace /></Suspense>
      </WouterRouter>
    );
  }

  if (import.meta.env.DEV && window.location.pathname.endsWith('/__visual/project-panorama')) {
    return (
      <WouterRouter base={basePath}>
        <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <AppLayout><Suspense fallback={<WorkspacePageFallback />}><ProjectDetail projectIdOverride="riverstone" /></Suspense></AppLayout>
              <Toaster />
            </TooltipProvider>
          </QueryClientProvider>
        </ClerkProvider>
      </WouterRouter>
    );
  }

  if (import.meta.env.DEV && window.location.pathname.endsWith('/__visual/schedule')) {
    return (
      <WouterRouter base={basePath}>
        <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <AppLayout><Suspense fallback={<WorkspacePageFallback />}><Schedule /></Suspense></AppLayout>
              <Toaster />
            </TooltipProvider>
          </QueryClientProvider>
        </ClerkProvider>
      </WouterRouter>
    );
  }

  if (import.meta.env.DEV && window.location.pathname.endsWith('/__visual/mobile-overview')) {
    return (
      <WouterRouter base={basePath}>
        <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <AppLayout><Suspense fallback={<WorkspacePageFallback />}><MobileOverview /></Suspense></AppLayout>
              <Toaster />
            </TooltipProvider>
          </QueryClientProvider>
        </ClerkProvider>
      </WouterRouter>
    );
  }

  if (import.meta.env.DEV && window.location.pathname.endsWith('/__visual/project-cards')) {
    return (
      <WouterRouter base={basePath}>
        <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <AppLayout><Suspense fallback={<WorkspacePageFallback />}><Projects /></Suspense></AppLayout>
            </TooltipProvider>
          </QueryClientProvider>
        </ClerkProvider>
      </WouterRouter>
    );
  }

  if (import.meta.env.DEV && window.location.pathname.endsWith('/__visual/trades')) {
    return (
      <WouterRouter base={basePath}>
        <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <AppLayout><Suspense fallback={<WorkspacePageFallback />}><TradesDirectory /></Suspense></AppLayout>
            </TooltipProvider>
          </QueryClientProvider>
        </ClerkProvider>
      </WouterRouter>
    );
  }

  if (import.meta.env.DEV && window.location.pathname.endsWith('/__visual/trade-detail')) {
    return (
      <WouterRouter base={basePath}>
        <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <Switch>
                <Route path="/__visual/trade-detail">
                  <AppLayout><Suspense fallback={<WorkspacePageFallback />}><TradeDetail tradeIdOverride="trade-logo" /></Suspense></AppLayout>
                </Route>
                <Route path="/trades">
                  <AppLayout><Suspense fallback={<WorkspacePageFallback />}><TradesDirectory /></Suspense></AppLayout>
                </Route>
              </Switch>
            </TooltipProvider>
          </QueryClientProvider>
        </ClerkProvider>
      </WouterRouter>
    );
  }

  if (import.meta.env.DEV && window.location.pathname.endsWith('/__visual/dashboard-cards')) {
    return (
      <WouterRouter base={basePath}>
        <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}>
          <QueryClientProvider client={queryClient}>
            <ProjectFolderImportProvider authState={{ isLoaded: true, isSignedIn: true }}>
              <TooltipProvider>
                 <AppLayout><Suspense fallback={<WorkspacePageFallback />}><Dashboard /></Suspense></AppLayout>
              </TooltipProvider>
            </ProjectFolderImportProvider>
          </QueryClientProvider>
        </ClerkProvider>
      </WouterRouter>
    );
  }

  if (import.meta.env.DEV && window.location.pathname.endsWith('/__visual/financials')) {
    return (
      <WouterRouter base={basePath}>
        <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
               <AppLayout><Suspense fallback={<WorkspacePageFallback />}><Invoices /></Suspense></AppLayout>
            </TooltipProvider>
          </QueryClientProvider>
        </ClerkProvider>
      </WouterRouter>
    );
  }

  if (import.meta.env.DEV && window.location.pathname.endsWith('/__visual/approvals')) {
    return (
      <WouterRouter base={basePath}>
        <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
               <AppLayout><Suspense fallback={<WorkspacePageFallback />}><Approvals /></Suspense></AppLayout>
            </TooltipProvider>
          </QueryClientProvider>
        </ClerkProvider>
      </WouterRouter>
    );
  }

  if (import.meta.env.DEV && window.location.pathname.endsWith('/__visual/users')) {
    return (
      <WouterRouter base={basePath}>
        <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
               <AppLayout><Suspense fallback={<WorkspacePageFallback />}><Users /></Suspense></AppLayout>
            </TooltipProvider>
          </QueryClientProvider>
        </ClerkProvider>
      </WouterRouter>
    );
  }

  if (import.meta.env.DEV && window.location.pathname.endsWith('/__visual/sidebar')) {
    return <SidebarVisualHarness />;
  }

  if (import.meta.env.DEV && window.location.pathname.endsWith('/__visual/folder-import')) {
    return (
      <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}>
        <QueryClientProvider client={queryClient}>
          <ProjectFolderImportProvider authState={{ isLoaded: true, isSignedIn: true }}>
            <FolderImportVisualHarness />
          </ProjectFolderImportProvider>
        </QueryClientProvider>
      </ClerkProvider>
    );
  }

  return (
    <WouterRouter base={basePath}>
      <ClerkProvider
        publishableKey={clerkPubKey}
        proxyUrl={clerkProxyUrl}
        signInUrl={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        appearance={{
          theme: shadcn,
          cssLayerName: "clerk",
          variables: { colorPrimary: "#d2aa3e", colorBackground: "#171b25", colorForeground: "#edf2f7", colorInput: "#202737", colorInputForeground: "#edf2f7", colorMutedForeground: "#9aa7b8", colorNeutral: "#edf2f7", fontFamily: "Plus Jakarta Sans", borderRadius: "0.75rem" },
          options: { logoImageUrl: `${window.location.origin}${basePath}/luminova-logo.png`, logoPlacement: "inside" },
          elements: { rootBox: "w-full flex justify-center", cardBox: "bg-[#171b25] w-[440px] max-w-full overflow-hidden", card: "!shadow-none !border !border-[#344052] !bg-transparent", footer: "!bg-transparent", formButtonPrimary: "!bg-[#d2aa3e] !text-[#171b25] hover:!bg-[#e0bb55]" },
        }}
      >
        <QueryClientProvider client={queryClient}>
            <ProjectFolderImportProvider>
              <TooltipProvider>
                <SessionPolicy />
                 <AuthenticatedPagePreloader />
                <Suspense fallback={<PageFallback />}><Router /></Suspense>
                <Toaster />
              </TooltipProvider>
            </ProjectFolderImportProvider>
        </QueryClientProvider>
      </ClerkProvider>
    </WouterRouter>
  );
}

function FolderImportVisualHarness() {
  const folderImport = useProjectFolderImport();
  return (
    <main className="p-8">
      <input
        aria-label="Project folder files"
        type="file"
        multiple
        onChange={(event) => folderImport.collectFolderFiles(Array.from(event.target.files || []))}
      />
      <button type="button" onClick={() => void folderImport.startFolderImport()}>Start import</button>
      <output aria-label="Import status">{folderImport.folderStatus}</output>
      <output aria-label="Uploaded files">{folderImport.folderProgress.uploaded}</output>
      {folderImport.folderError && <p data-testid="dashboard-import-alert" role="alert">{folderImport.folderError}</p>}
    </main>
  );
}

function SidebarVisualHarness() {
  const params = new URLSearchParams(window.location.search);
  const [activeLocation, setActiveLocation] = useState(`/${params.get('active') || 'projects'}`);
  const [initialDrawerOpen, setInitialDrawerOpen] = useState(params.get('drawer') === 'open');

  return (
    <WouterRouter base={basePath}>
      <AppLayoutView
        key={activeLocation}
        location={activeLocation}
        displayName="Morgan Reyes"
        email="morgan@luminova.test"
        onSignOut={() => undefined}
        onNavigate={(destination) => {
          setInitialDrawerOpen(false);
          setActiveLocation(destination);
        }}
        initialSidebarOpen={initialDrawerOpen}
        initialSidebarCollapsed={
          params.get('sidebar') === 'compact'
            ? true
            : params.get('sidebar') === 'expanded'
              ? false
              : undefined
        }
        initialProfileOpen={params.get('profile') === 'open'}
        hoveredHref={params.get('hover') === 'trades' ? '/trades' : undefined}
        showCookieConsent={false}
      >
        <section className="m-4 min-h-64 rounded-2xl bg-sidebar p-8 text-sidebar-foreground shadow-xl" data-testid="shared-dark-surface">
          <p className="font-mono text-xs uppercase tracking-widest text-sidebar-foreground/60">Shared dark surface</p>
          <h1 className="mt-3 text-3xl font-bold">Project controls stay readable.</h1>
          <div className="mt-6 border-t border-sidebar-border pt-4 text-sidebar-foreground/70">Divider and secondary label token check</div>
        </section>
      </AppLayoutView>
    </WouterRouter>
  );
}

export default App;
