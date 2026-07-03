import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import { DashboardLayout } from "@/shared/components/layouts";

// Lazy-loaded pages (code splitting — loads each page only when needed)
const Landing         = lazy(() => import("./pages/landing/page"));
const Login           = lazy(() => import("./pages/login/page"));
const Dashboard       = lazy(() => import("./pages/page"));
const Providers       = lazy(() => import("./pages/providers/page"));
const ProviderDetail  = lazy(() => import("./pages/providers/[id]/page"));
const ProvidersNew    = lazy(() => import("./pages/providers/new/page"));
const Usage           = lazy(() => import("./pages/usage/page"));
const Quota           = lazy(() => import("./pages/quota/page"));
const ProxyPools      = lazy(() => import("./pages/proxy-pools/page"));
const Combos          = lazy(() => import("./pages/combos/page"));
const Endpoint        = lazy(() => import("./pages/endpoint/page"));
const Translator      = lazy(() => import("./pages/translator/page"));
const CliTools        = lazy(() => import("./pages/cli-tools/page"));
const CliToolDetail   = lazy(() => import("./pages/cli-tools/[toolId]/page"));
const Automation      = lazy(() => import("./pages/automation/page"));
const BasicChat       = lazy(() => import("./pages/basic-chat/page"));
const Mitm            = lazy(() => import("./pages/mitm/page"));
const Profile         = lazy(() => import("./pages/profile/page"));
const Docs            = lazy(() => import("./pages/docs/page"));
const Skills          = lazy(() => import("./pages/skills/page"));
const ConsoleLog      = lazy(() => import("./pages/console-log/page"));
const MediaProviders  = lazy(() => import("./pages/media-providers/web/page"));

// Auth guard — check if dashboard session cookie is present
function RequireAuth({ children }: { children: React.ReactNode }) {
  // Simple check — backend /api/auth/status will confirm
  const hasSession = document.cookie.includes("9r_session") ||
                     localStorage.getItem("9r_authed") === "1";
  if (!hasSession) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoadingFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <span>Loading...</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Public */}
          <Route path="/"       element={<Landing />} />
          <Route path="/login"  element={<Login />} />

          {/* Protected dashboard */}
          <Route path="/dashboard" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="providers"       element={<Providers />} />
            <Route path="providers/new"   element={<ProvidersNew />} />
            <Route path="providers/:id"   element={<ProviderDetail />} />
            <Route path="usage"           element={<Usage />} />
            <Route path="quota"           element={<Quota />} />
            {/* Pricing settings page omitted in v2 currently */}
            <Route path="proxy-pools"     element={<ProxyPools />} />
            <Route path="combos"          element={<Combos />} />
            <Route path="endpoint"        element={<Endpoint />} />
            <Route path="translator"      element={<Translator />} />
            <Route path="cli-tools"       element={<CliTools />} />
            <Route path="cli-tools/:toolId" element={<CliToolDetail />} />
            <Route path="automation"      element={<Automation />} />
            <Route path="basic-chat"      element={<BasicChat />} />
            <Route path="mitm"            element={<Mitm />} />
            <Route path="profile"         element={<Profile />} />
            <Route path="docs"            element={<Docs />} />
            <Route path="skills"          element={<Skills />} />
            <Route path="console-log"     element={<ConsoleLog />} />
            <Route path="media-providers/web" element={<MediaProviders />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
