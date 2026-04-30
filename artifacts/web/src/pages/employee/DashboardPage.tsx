import { useMemo } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListReports,
  getListReportsQueryKey,
} from "@workspace/api-client-react";
import { useAuthedUser } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";
import { StatusPill } from "@/components/brand/StatusPill";
import { HtCard, HtCardHeader } from "@/components/brand/Card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusCircle, Clock, CheckCircle, ArrowRight } from "lucide-react";

export function DashboardPage() {
  const user = useAuthedUser();
  
  const { data: reports = [], isLoading } = useListReports(
    { scope: "mine" },
    { query: { queryKey: getListReportsQueryKey({ scope: "mine" }) } }
  );

  const stats = useMemo(() => {
    let openCount = 0;
    let pendingApprovalCount = 0;
    let reimbursedYtd = 0;

    const currentYear = new Date().getFullYear();

    reports.forEach((r) => {
      const amount = Number(r.total);

      if (r.status === "Draft" || r.status === "Changes Requested") {
        openCount++;
      } else if (
        r.status === "Submitted" ||
        r.status === "Manager Review" ||
        r.status === "Manager Approved" ||
        r.status === "Finance Review" ||
        r.status === "Finance Approved" ||
        r.status === "Posted to QuickBooks" ||
        r.status === "Ready for Payroll Reimbursement"
      ) {
        pendingApprovalCount++;
      }

      if (
        (r.status === "Paid Through Payroll" || r.status === "Reconciled") &&
        r.period && new Date(r.period).getFullYear() === currentYear
      ) {
        reimbursedYtd += amount;
      }
    });

    return { openCount, pendingApprovalCount, reimbursedYtd };
  }, [reports]);

  const recentReports = reports.slice(0, 5);

  return (
    <div className="space-y-6 pb-12" data-testid="page-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Welcome, {user.user.fullName}
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Here's what's happening with your expenses.
          </p>
        </div>
        <Link href="/reports/new">
          <Button>
            <PlusCircle className="w-4 h-4 mr-2" />
            New Report
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HtCard style={{ padding: "1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-medium text-[var(--ht-ink-3)]">Open Reports</div>
            <div className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
              {stats.openCount}
            </div>
          </div>
        </HtCard>
        <HtCard style={{ padding: "1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-[var(--ht-orange)]">
            <ArrowRight className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-medium text-[var(--ht-ink-3)]">Pending Approvals</div>
            <div className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
              {stats.pendingApprovalCount}
            </div>
          </div>
        </HtCard>
        <HtCard style={{ padding: "1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-700">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-medium text-[var(--ht-ink-3)]">Reimbursed YTD</div>
            <div className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
              {formatMoney(stats.reimbursedYtd)}
            </div>
          </div>
        </HtCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <HtCard>
            <HtCardHeader title="Recent Reports" />
            {isLoading ? (
              <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">Loading reports...</div>
            ) : recentReports.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
                You don't have any recent reports.
                <div className="mt-4">
                  <Link href="/reports/new">
                    <Button variant="outline">Create your first report</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/reports/${report.id}`}
                          className="text-[var(--ht-primary)] hover:underline"
                        >
                          {report.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-[var(--ht-ink-2)]">
                        {report.period ? formatDate(report.period) : "-"}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={report.status} />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(Number(report.total))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {recentReports.length > 0 && (
              <div className="p-4 border-t border-[var(--ht-border)] text-center">
                <Link href="/reports">
                  <Button variant="link" className="text-[var(--ht-ink-2)] hover:text-[var(--ht-ink)]">
                    View all reports
                  </Button>
                </Link>
              </div>
            )}
          </HtCard>
        </div>

        <div>
          <HtCard>
            <HtCardHeader title="Quick Actions" />
            <div className="p-4 space-y-3">
              <Link href="/reports/new">
                <Button variant="outline" className="w-full justify-start">
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Create New Report
                </Button>
              </Link>
              {(user.role === "Manager Approver" || user.role === "Finance Approver" || user.role === "System Admin" || user.role === "Accounting Admin") && (
                <Link href={user.role === "Finance Approver" ? "/finance/queue" : "/manager/queue"}>
                  <Button variant="outline" className="w-full justify-start">
                    <Clock className="w-4 h-4 mr-2" />
                    Review Approvals Queue
                  </Button>
                </Link>
              )}
            </div>
          </HtCard>
        </div>
      </div>
    </div>
  );
}
