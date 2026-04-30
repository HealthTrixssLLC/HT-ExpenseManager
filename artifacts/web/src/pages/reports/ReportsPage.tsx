import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListReports,
  getListReportsQueryKey,
} from "@workspace/api-client-react";
import { useAuthedUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { HtCard, HtCardHeader } from "@/components/brand/Card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export function ReportsPage() {
  const user = useAuthedUser();
  const isAdminOrFinance = user.role === "System Admin" || user.role === "Accounting Admin" || user.role === "Finance Approver";
  
  const scope = isAdminOrFinance ? "all" : "mine";
  const { data: reports = [], isLoading } = useListReports(
    { scope },
    { query: { queryKey: getListReportsQueryKey({ scope }) } }
  );

  const stats = useMemo(() => {
    let total = 0;
    let pending = 0;
    let reimbursed = 0;
    const byCategory: Record<string, number> = {};
    const byDepartment: Record<string, number> = {};
    const byMonth: Record<string, number> = {};

    reports.forEach((r) => {
      const amount = Number(r.total);
      total += amount;

      if (
        r.status === "Submitted" ||
        r.status === "Manager Review" ||
        r.status === "Finance Review" ||
        r.status === "Manager Approved" ||
        r.status === "Finance Approved" ||
        r.status === "Posted to QuickBooks" ||
        r.status === "Ready for Payroll Reimbursement"
      ) {
        pending += amount;
      }

      if (r.status === "Paid Through Payroll" || r.status === "Reconciled") {
        reimbursed += amount;
      }

      // Department breakdown
      const dept = r.departmentName || "Unknown";
      byDepartment[dept] = (byDepartment[dept] || 0) + amount;

      // Month breakdown
      if (r.period) {
        const month = new Date(r.period).toLocaleString('default', { month: 'short', year: '2-digit' });
        byMonth[month] = (byMonth[month] || 0) + amount;
      }
    });

    const categoryData = Object.entries(byCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const departmentData = Object.entries(byDepartment)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Sort by chronological order ideally, but simple string sort works for now if formatted properly
    const monthData = Object.entries(byMonth)
      .map(([name, value]) => ({ name, value }));

    return {
      total,
      pending,
      reimbursed,
      categoryData,
      departmentData,
      monthData
    };
  }, [reports]);

  const COLORS = ["#003366", "#D9531E", "#008080", "#E6A800", "#4A4A4A"];

  return (
    <div className="space-y-6 pb-12" data-testid="page-reports">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
          {isAdminOrFinance ? "Company Spend" : "My Spend Analytics"}
        </h1>
        <p className="text-sm text-[var(--ht-ink-3)]">
          Insights and trends based on your expense reports.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HtCard pad={24}>
          <div className="text-sm font-medium text-[var(--ht-ink-3)]">Total Tracked</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ht-ink)]">
            {formatMoney(stats.total)}
          </div>
        </HtCard>
        <HtCard pad={24}>
          <div className="text-sm font-medium text-[var(--ht-ink-3)]">Pending Processing</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ht-orange)]">
            {formatMoney(stats.pending)}
          </div>
        </HtCard>
        <HtCard pad={24}>
          <div className="text-sm font-medium text-[var(--ht-ink-3)]">Reimbursed</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-green-700">
            {formatMoney(stats.reimbursed)}
          </div>
        </HtCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HtCard style={{ minHeight: 400, display: "flex", flexDirection: "column" }}>
          <HtCardHeader title="Spend by Month" />
          <div className="p-6 flex-1 flex items-center justify-center">
            {isLoading ? (
              <div className="text-[var(--ht-ink-3)]">Loading data...</div>
            ) : stats.monthData.length === 0 ? (
              <div className="text-[var(--ht-ink-3)]">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={(value) => formatMoney(Number(value))}
                  />
                  <Tooltip 
                    formatter={(value: number) => formatMoney(value)}
                    cursor={{ fill: 'transparent' }}
                  />
                  <Bar dataKey="value" fill="var(--ht-navy)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </HtCard>

        <HtCard style={{ minHeight: 400, display: "flex", flexDirection: "column" }}>
          <HtCardHeader title="Spend by Department" />
          <div className="p-6 flex-1 flex items-center justify-center">
            {isLoading ? (
              <div className="text-[var(--ht-ink-3)]">Loading data...</div>
            ) : stats.departmentData.length === 0 ? (
              <div className="text-[var(--ht-ink-3)]">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.departmentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={120}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {stats.departmentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatMoney(value)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </HtCard>
      </div>
    </div>
  );
}
