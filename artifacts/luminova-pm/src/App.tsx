import { lazy, Suspense, type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppLayoutView } from '@/components/layout/app-layout';
import { ClerkProvider, Show, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ProjectFolderImportProvider, useProjectFolderImport } from '@/providers/project-folder-import-provider';

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
const Dashboard = lazy(() => import('@/pages/dashboard'));
const ProjectDetail = lazy(() => import('@/pages/projects/[id]'));
const Projects = lazy(() => import('@/pages/projects'));
const TradesDirectory = lazy(() => import('@/pages/trades'));
const TradeDetail = lazy(() => import('@/pages/trades/[id]'));
const Invoices = lazy(() => import('@/pages/invoices'));
const Messages = lazy(() => import('@/pages/messages'));
const Users = lazy(() => import('@/pages/users'));
const Quotes = lazy(() => import('@/pages/quotes'));
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

function Protected({ children }: { children: ReactNode }) {
  return <>
    <Show when="signed-in">{children}</Show>
    <Show when="signed-out"><Redirect to="/sign-in" /></Show>
  </>;
}

function Home() {
  return <>
    <Show when="signed-in"><Dashboard /></Show>
    <Show when="signed-out">
      <main className="flex min-h-[100dvh] items-center justify-center overflow-hidden bg-sidebar bg-tech-grid-soft p-6 text-sidebar-foreground">
        <div className="relative z-10 max-w-xl text-center">
          <img src="/luminova-logo.png" alt="Luminova Construction" className="mx-auto mb-8 h-32 w-72 object-contain" />
          <p className="font-mono text-xs uppercase tracking-[.24em] text-primary">Secure construction operations</p>
          <h1 className="mt-4 text-4xl font-extrabold sm:text-5xl">Build with complete visibility.</h1>
          <Link href="/sign-in" className="tech-clip gold-glow mx-auto mt-8 inline-flex h-12 items-center justify-center bg-primary px-8 font-bold text-primary-foreground">Sign in</Link>
        </div>
      </main>
    </Show>
  </>;
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

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/sign-in/*?" component={Login} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/login" component={Login} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/" component={Home} />
        <Route path="/intro"><Protected><Intro /></Protected></Route>
        <Route path="/projects/:id"><Protected><ProjectDetail /></Protected></Route>
        <Route path="/projects"><Protected><Projects /></Protected></Route>
        <Route path="/trades"><Protected><TradesDirectory /></Protected></Route>
        <Route path="/trades/:id"><Protected><TradeDetail /></Protected></Route>
        <Route path="/invoices"><Protected><Invoices /></Protected></Route>
        <Route path="/quotes"><Protected><Quotes /></Protected></Route>
        <Route path="/messages"><Protected><Messages /></Protected></Route>
        <Route path="/users"><Protected><Users /></Protected></Route>
        <Route component={NotFound} />
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

function App() {
  if (import.meta.env.DEV && window.location.pathname.endsWith('/__visual/messages')) {
    return (
      <WouterRouter base={basePath}>
        <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <Suspense fallback={<PageFallback />}><Messages /></Suspense>
            </TooltipProvider>
          </QueryClientProvider>
        </ClerkProvider>
      </WouterRouter>
    );
  }

  if (import.meta.env.DEV && window.location.pathname.endsWith('/__visual/project-panorama')) {
    return (
      <WouterRouter base={basePath}>
        <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <Suspense fallback={<PageFallback />}><ProjectDetail projectIdOverride="riverstone" /></Suspense>
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
              <Suspense fallback={<PageFallback />}><Projects /></Suspense>
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
                <Suspense fallback={<PageFallback />}><Dashboard /></Suspense>
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
              <Invoices />
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
          variables: { colorPrimary: "#b59c3f", colorBackground: "#242424", colorForeground: "#ffffff", colorInput: "#303030", colorInputForeground: "#ffffff", colorMutedForeground: "#bdbdbd", colorNeutral: "#555555", fontFamily: "Plus Jakarta Sans", borderRadius: "0px" },
          options: { logoImageUrl: `${window.location.origin}${basePath}/luminova-logo.png`, logoPlacement: "inside" },
          elements: { rootBox: "w-full flex justify-center", cardBox: "bg-[#242424] w-[440px] max-w-full overflow-hidden", card: "!shadow-none !border !border-[#555] !bg-transparent", footer: "!bg-transparent", formButtonPrimary: "!bg-[#b59c3f] !text-black hover:!bg-[#c8ae4b]" },
        }}
      >
        <QueryClientProvider client={queryClient}>
            <ProjectFolderImportProvider>
              <TooltipProvider>
                <SessionPolicy />
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

  return (
    <WouterRouter base={basePath}>
      <AppLayoutView
        location={activeLocation}
        displayName="Morgan Reyes"
        email="morgan@luminova.test"
        onSignOut={() => undefined}
        onNavigate={setActiveLocation}
        initialSidebarOpen={params.get('drawer') === 'open'}
        initialProfileOpen={params.get('profile') === 'open'}
        hoveredHref={params.get('hover') === 'trades' ? '/trades' : undefined}
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
