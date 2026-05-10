import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route, Router } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { configureApi } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { AppShell, ProtectedRoute } from "@/components/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { ForbiddenPage } from "@/pages/ForbiddenPage";
import { EulaPage } from "@/pages/legal/EulaPage";
import NotFound from "@/pages/not-found";
import {
  roleCanFinanceReview,
  roleCanManagerReview,
  roleCanAdmin,
  roleCanSysAdmin,
} from "@/lib/types";

// Employee
import { DashboardPage } from "@/pages/employee/DashboardPage";
import { MyReportsPage } from "@/pages/employee/MyReportsPage";
import { CreateReportPage } from "@/pages/employee/CreateReportPage";
import { ReportDetailPage } from "@/pages/employee/ReportDetailPage";
import { AddLineItemPage } from "@/pages/employee/AddLineItemPage";
import { ReceiptsPage } from "@/pages/employee/ReceiptsPage";
import { ProfilePage } from "@/pages/employee/ProfilePage";
// Manager
import { ManagerQueuePage } from "@/pages/manager/ManagerQueuePage";
import { ManagerReviewPage } from "@/pages/manager/ManagerReviewPage";
import { DelegationPage } from "@/pages/manager/DelegationPage";
// Finance
import { FinanceQueuePage } from "@/pages/finance/FinanceQueuePage";
import { FinanceReviewPage } from "@/pages/finance/FinanceReviewPage";
import { PayrollPage } from "@/pages/finance/PayrollPage";
import { ReconciliationPage } from "@/pages/finance/ReconciliationPage";
// Admin
import { UsersPage } from "@/pages/admin/UsersPage";
import { GlMappingPage } from "@/pages/admin/GlMappingPage";
import { PolicyPage } from "@/pages/admin/PolicyPage";
import { QboPage } from "@/pages/admin/QboPage";
import { QboTagsPage } from "@/pages/admin/QboTagsPage";
import { AuditLogPage } from "@/pages/admin/AuditLogPage";
import { BackupRestorePage } from "@/pages/admin/BackupRestorePage";
// Reports
import { ReportsPage } from "@/pages/reports/ReportsPage";
// Help
import HelpIndexPage from "@/pages/help/HelpIndexPage";
import HelpTopicPage from "@/pages/help/HelpTopicPage";

configureApi();

// Wouter base = the artifact's path prefix without trailing slash, so deep
// links like `/web/manager/queue` resolve correctly behind the workspace
// proxy.
const ROUTER_BASE = (() => {
  const raw = import.meta.env.BASE_URL ?? "/";
  if (raw === "/" || raw === "") return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
})();

function FullPageSpinner() {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        background: "var(--ht-canvas)",
        color: "var(--ht-ink-3)",
        fontSize: 13,
      }}
    >
      Loading…
    </div>
  );
}

function AuthedRoutes() {
  return (
    <AppShell>
      <Switch>
        {/* Employee */}
        <Route path="/" component={DashboardPage} />
        <Route path="/my-reports" component={MyReportsPage} />
        <Route path="/reports/new" component={CreateReportPage} />
        <Route path="/reports/:id">
          {(params) => <ReportDetailPage id={params.id!} />}
        </Route>
        <Route path="/reports/:id/lines/new">
          {(params) => <AddLineItemPage id={params.id!} />}
        </Route>
        <Route path="/reports/:id/receipts">
          {(params) => <ReceiptsPage id={params.id!} />}
        </Route>
        <Route path="/profile" component={ProfilePage} />

        {/* Manager */}
        <Route path="/manager/queue">
          <ProtectedRoute allow={roleCanManagerReview} fallback={<ForbiddenPage />}>
            <ManagerQueuePage />
          </ProtectedRoute>
        </Route>
        <Route path="/manager/queue/:id">
          {(params) => (
            <ProtectedRoute allow={roleCanManagerReview} fallback={<ForbiddenPage />}>
              <ManagerReviewPage id={params.id!} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/manager/delegation">
          <ProtectedRoute allow={roleCanManagerReview} fallback={<ForbiddenPage />}>
            <DelegationPage />
          </ProtectedRoute>
        </Route>

        {/* Finance */}
        <Route path="/finance/queue">
          <ProtectedRoute allow={roleCanFinanceReview} fallback={<ForbiddenPage />}>
            <FinanceQueuePage />
          </ProtectedRoute>
        </Route>
        <Route path="/finance/queue/:id">
          {(params) => (
            <ProtectedRoute allow={roleCanFinanceReview} fallback={<ForbiddenPage />}>
              <FinanceReviewPage id={params.id!} />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/finance/payroll">
          <ProtectedRoute allow={roleCanFinanceReview} fallback={<ForbiddenPage />}>
            <PayrollPage />
          </ProtectedRoute>
        </Route>
        <Route path="/finance/reconciliation">
          <ProtectedRoute allow={roleCanFinanceReview} fallback={<ForbiddenPage />}>
            <ReconciliationPage />
          </ProtectedRoute>
        </Route>

        {/* Admin */}
        <Route path="/admin/users">
          <ProtectedRoute allow={roleCanAdmin} fallback={<ForbiddenPage />}>
            <UsersPage />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/gl">
          <ProtectedRoute allow={roleCanAdmin} fallback={<ForbiddenPage />}>
            <GlMappingPage />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/policy">
          <ProtectedRoute allow={roleCanAdmin} fallback={<ForbiddenPage />}>
            <PolicyPage />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/qbo">
          <ProtectedRoute allow={roleCanAdmin} fallback={<ForbiddenPage />}>
            <QboPage />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/qbo-tags">
          <ProtectedRoute allow={roleCanAdmin} fallback={<ForbiddenPage />}>
            <QboTagsPage />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/audit">
          <ProtectedRoute allow={roleCanAdmin} fallback={<ForbiddenPage />}>
            <AuditLogPage />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/backup-restore">
          <ProtectedRoute allow={roleCanSysAdmin} fallback={<ForbiddenPage />}>
            <BackupRestorePage />
          </ProtectedRoute>
        </Route>

        {/* Insights */}
        <Route path="/reports" component={ReportsPage} />

        {/* Help */}
        <Route path="/help" component={HelpIndexPage} />
        <Route path="/help/:id" component={HelpTopicPage} />

        {/* Legal */}
        <Route path="/legal/eula" component={EulaPage} />

        <Route path="/forbidden" component={ForbiddenPage} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function Root() {
  const { status } = useAuth();
  useEffect(() => {
    configureApi();
  }, []);
  if (status === "loading") return <FullPageSpinner />;
  if (status === "anonymous") {
    // Allow the EULA page to be reachable while signed out so the login link
    // and externally-shared deep links work without an account.
    return (
      <Switch>
        <Route path="/legal/eula" component={EulaPage} />
        <Route component={LoginPage} />
      </Switch>
    );
  }
  return <AuthedRoutes />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Router base={ROUTER_BASE}>
            <Root />
          </Router>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
