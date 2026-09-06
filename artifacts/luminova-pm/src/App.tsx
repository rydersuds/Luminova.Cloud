import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Dashboard from '@/pages/dashboard';
import ProjectDetail from '@/pages/projects/[id]';
import Projects from '@/pages/projects';
import TradesDirectory from '@/pages/trades';
import TradeDetail from '@/pages/trades/[id]';
import Invoices from '@/pages/invoices';
import Messages from '@/pages/messages';
import Login from '@/pages/login';
import { SignUpPage } from '@/pages/login';
import Users from '@/pages/users';
import { ClerkProvider, Show } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';

import {
  Route,
  Switch,
  Redirect,
  Link,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

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
      <main className="flex min-h-[100dvh] items-center justify-center overflow-hidden bg-sidebar bg-tech-grid p-6 text-sidebar-foreground">
        <div className="relative z-10 max-w-xl text-center">
          <img src="/luminova-logo.png" alt="Luminova Construction" className="mx-auto mb-8 h-32 w-72 object-contain" />
          <p className="font-mono text-xs uppercase tracking-[.24em] text-primary">Secure construction operations</p>
          <h1 className="mt-4 text-4xl font-extrabold sm:text-5xl">Build with complete visibility.</h1>
          <p className="mx-auto mt-5 max-w-lg text-sidebar-foreground/65">Manage projects, trades, budgets, invoices, field activity, and your team from one protected workspace.</p>
          <Link href="/sign-in" className="tech-clip gold-glow mx-auto mt-8 inline-flex h-12 items-center justify-center bg-primary px-8 font-bold text-primary-foreground">Sign in to workspace</Link>
        </div>
      </main>
    </Show>
  </>;
}

function Intro() {
  const [, setLocation] = useLocation();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setLeaving(true), 3500);
    const routeTimer = window.setTimeout(() => setLocation("/", { replace: true }), 4000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(routeTimer);
    };
  }, [setLocation]);

  return (
    <div className={`fixed inset-0 z-[100] bg-black transition-opacity duration-500 ${leaving ? "opacity-0" : "opacity-100"}`}>
      <iframe
        src={`${basePath}/luminova-intro-animation.html`}
        title="Luminova Construction introduction"
        className="h-full w-full border-0 bg-black"
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
        <Route path="/" component={Home} />
        <Route path="/intro"><Protected><Intro /></Protected></Route>
        <Route path="/projects/:id"><Protected><ProjectDetail /></Protected></Route>
        <Route path="/projects"><Protected><Projects /></Protected></Route>
        <Route path="/trades"><Protected><TradesDirectory /></Protected></Route>
        <Route path="/trades/:id"><Protected><TradeDetail /></Protected></Route>
        <Route path="/invoices"><Protected><Invoices /></Protected></Route>
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

function App() {
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
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ClerkProvider>
    </WouterRouter>
  );
}

export default App;
