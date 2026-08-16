import {
  Component,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { HashRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Compass, Menu, RefreshCw } from "lucide-react";
import { Button, ConfirmProvider, EmptyState } from "@/components/ui";
import { PageShell } from "@/components/shell/PageShell";
import { Sidebar, type SidebarItem } from "@/components/shell/Sidebar";
import { TitleBar } from "@/components/shell/TitleBar";
import type { FeatureChildRoute, FeatureRoute } from "@/lib/featureRoute";
import { useSessionStore, useSrsStore } from "@/stores";
import { cn } from "@/lib/cn";

/**
 * Route auto-discovery: every `features/<name>/route.tsx` default-exports a
 * FeatureRoute. Adding a feature never requires editing this file or Sidebar.
 */
const modules = import.meta.glob<{ default: FeatureRoute }>("./features/*/route.tsx", {
  eager: true,
});

const featureRoutes: FeatureRoute[] = Object.entries(modules)
  .map(([file, mod]) => ({ file, route: mod?.default }))
  .filter((entry): entry is { file: string; route: FeatureRoute } => {
    if (!entry.route?.path || !entry.route?.element) {
      console.error(`[BandReady] ${entry.file} does not default-export a valid FeatureRoute`);
      return false;
    }
    return true;
  })
  .map((entry) => entry.route)
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.path.localeCompare(b.path));

const navItems: SidebarItem[] = featureRoutes
  .filter((r) => Boolean(r.label))
  .map((r) => ({ path: r.path, label: r.label as string, icon: r.icon, end: r.end, group: r.group }));

function renderChildren(children: FeatureChildRoute[] | undefined): ReactNode {
  return children?.map((child, i) =>
    child.index ? (
      <Route key={`index-${i}`} index element={child.element} />
    ) : (
      <Route key={`${child.path}-${i}`} path={child.path} element={child.element}>
        {renderChildren(child.children)}
      </Route>
    ),
  );
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <PageShell title="Page not found" description="That route does not exist in BandReady.">
      <EmptyState
        icon={Compass}
        title="Nothing here"
        description="The link you followed points at a screen that isn't part of the app."
        action={<Button onClick={() => navigate("/")}>Go to Home</Button>}
      />
    </PageShell>
  );
}

interface BoundaryState {
  error: Error | null;
}

/** Shows the failure instead of a white screen (12 §9 error states). */
class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[BandReady] render error", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center overflow-auto p-8">
        <div className="w-full max-w-xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold">Something went wrong on this screen</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Your work is saved on the sidecar. Reloading usually clears this.
            </p>
          </div>
          <pre className="scrollbar-thin max-h-64 overflow-auto rounded-xl border border-border bg-card p-4 text-[11px] leading-relaxed text-destructive">
            {error.stack ?? `${error.name}: ${error.message}`}
          </pre>
          <div className="flex gap-2">
            <Button onClick={() => this.setState({ error: null })}>
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload BandReady
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

function Shell() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const connect = useSessionStore((s) => s.connect);
  const refreshDue = useSrsStore((s) => s.refreshDue);

  useEffect(() => {
    void connect().then(() => refreshDue());
  }, [connect, refreshDue]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const routeElements = useMemo(
    () =>
      featureRoutes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element}>
          {renderChildren(route.children)}
        </Route>
      )),
    [],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <TitleBar />
      <div className="relative flex min-h-0 flex-1">
        <div
          className={cn(
            "fixed inset-0 z-30 bg-black/50 transition-opacity md:hidden",
            mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
        <Sidebar items={navItems} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />

        <main className="min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-2 z-20 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <ErrorBoundary key={location.pathname}>
            <Routes>
              {routeElements}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ConfirmProvider>
        <Shell />
      </ConfirmProvider>
    </HashRouter>
  );
}

export default App;
