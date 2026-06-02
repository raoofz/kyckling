import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import Layout from "@/components/Layout";
import Login from "@/pages/login";
import OfflineBanner from "@/components/OfflineBanner";
import PWAInstallBanner from "@/components/PWAInstallBanner";

// ── Lazy-loaded pages ─────────────────────────────────────────────────────────
import Dashboard from "@/pages/dashboard";

const Flocks            = lazy(() => import("@/pages/flocks"));
const Hatching          = lazy(() => import("@/pages/hatching"));
const Tasks             = lazy(() => import("@/pages/tasks"));
const Workspace         = lazy(() => import("@/pages/workspace"));
const Accounting        = lazy(() => import("@/pages/accounting"));
const AiAnalysis        = lazy(() => import("@/pages/ai-analysis"));
const AdvancedAnalysis  = lazy(() => import("@/pages/advanced-analysis"));
const PrecisionAnalysis = lazy(() => import("@/pages/precision-analysis"));
const Finance           = lazy(() => import("@/pages/finance"));
const Analytics         = lazy(() => import("@/pages/analytics"));
const Brain             = lazy(() => import("@/pages/brain"));
const Operations        = lazy(() => import("@/pages/operations"));
const FeedIntelligence  = lazy(() => import("@/pages/feed-intelligence"));
const DailyPlan         = lazy(() => import("@/pages/daily-plan"));
const SettingsPage      = lazy(() => import("@/pages/settings"));
const OfflinePage       = lazy(() => import("@/pages/offline"));
const Incubators        = lazy(() => import("@/pages/incubators"));
const SalesPage         = lazy(() => import("@/pages/sales"));
const FarmAnalyticsPage = lazy(() => import("@/pages/farm-analytics"));
const NotFound          = lazy(() => import("@/pages/not-found"));

// ── Query Client ──────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403 || error?.status === 404) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

// ── Loader ────────────────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

// ── Worker Access Control ─────────────────────────────────────────────────────
// Pages restricted to admins only. Workers are redirected to home.
const ADMIN_ONLY_PATHS = new Set([
  "/finance", "/analytics", "/workspace", "/accounting",
  "/brain", "/ai", "/ai/advanced", "/ai/precision",
  "/settings", "/daily-plan",
]);

interface ProtectedRouteProps {
  component: React.ComponentType;
  adminOnly?: boolean;
}

function ProtectedRoute({ component: Component, adminOnly }: ProtectedRouteProps) {
  const { isAdmin } = useAuth();
  if (adminOnly && !isAdmin) return <Redirect to="/" />;
  return <Component />;
}

// ── App Routes ────────────────────────────────────────────────────────────────
function AppRoutes() {
  const { user, loading } = useAuth();
  const { dir, t } = useLanguage();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir={dir}>
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          {/* ── Public to all authenticated users ── */}
          <Route path="/"            component={Dashboard} />
          <Route path="/flocks"      component={Flocks} />
          <Route path="/hatching"    component={Hatching} />
          <Route path="/tasks"       component={Tasks} />
          <Route path="/operations"  component={Operations} />
          <Route path="/feed"        component={FeedIntelligence} />
          <Route path="/incubators"  component={Incubators} />
          <Route path="/sales"       component={SalesPage} />
          <Route path="/offline"     component={OfflinePage} />

          {/* ── Admin only ── */}
          <Route path="/finance">
            {() => <ProtectedRoute component={Finance} adminOnly />}
          </Route>
          <Route path="/analytics">
            {() => <ProtectedRoute component={Analytics} adminOnly />}
          </Route>
          <Route path="/farm-analytics">
            {() => <ProtectedRoute component={FarmAnalyticsPage} adminOnly />}
          </Route>
          <Route path="/workspace">
            {() => <ProtectedRoute component={Workspace} adminOnly />}
          </Route>
          <Route path="/accounting">
            {() => <ProtectedRoute component={Accounting} adminOnly />}
          </Route>
          {/* Legacy paths — redirect to the unified workspace */}
          <Route path="/goals"><Redirect to="/workspace?tab=goals" /></Route>
          <Route path="/logs"><Redirect to="/workspace?tab=timeline" /></Route>
          <Route path="/notes"><Redirect to="/workspace?tab=timeline" /></Route>
          {/* Friendly alias redirects */}
          <Route path="/chickens"><Redirect to="/flocks" /></Route>
          <Route path="/poultry"><Redirect to="/flocks" /></Route>
          <Route path="/machines"><Redirect to="/incubators" /></Route>
          <Route path="/brain">
            {() => <ProtectedRoute component={Brain} adminOnly />}
          </Route>
          <Route path="/daily-plan">
            {() => <ProtectedRoute component={DailyPlan} adminOnly />}
          </Route>
          <Route path="/ai">
            {() => <ProtectedRoute component={AiAnalysis} adminOnly />}
          </Route>
          <Route path="/ai/advanced">
            {() => <ProtectedRoute component={AdvancedAnalysis} adminOnly />}
          </Route>
          <Route path="/ai/precision">
            {() => <ProtectedRoute component={PrecisionAnalysis} adminOnly />}
          </Route>
          <Route path="/settings">
            {() => <ProtectedRoute component={SettingsPage} adminOnly />}
          </Route>

          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </Layout>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <OfflineBanner />
              <AppRoutes />
              <PWAInstallBanner />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
