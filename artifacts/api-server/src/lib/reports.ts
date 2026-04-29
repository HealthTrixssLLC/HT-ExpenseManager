import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  departmentsTable,
  expenseReportsTable,
  lineItemsTable,
  receiptsTable,
  usersTable,
  type ExpenseReport,
  type LineItem,
  type Receipt,
  type User,
} from "../lib/db";
import type { WorkflowStatus } from "@workspace/db";
import {
  ageInDays,
  formatPeriod,
  rollupTotals,
  toLineItemDto,
  toReceiptDto,
  toUserRef,
  type ExpenseReportDto,
  type ExpenseReportSummaryDto,
} from "./serializers";

// Statuses a Finance Approver is allowed to see. Anything pre-manager-approval
// is invisible to finance — the manager queue owns the editable funnel and
// finance has no business reading drafts/submissions/changes-requested. Once a
// manager has approved (or finance has subsequently acted, posted, paid,
// reconciled, or hit a sync error), the report is fair game for finance.
// Voided reports are intentionally included because finance may need to audit
// a once-approved report that was later voided. Rejected reports are NOT
// included because rejection is purely a manager-side outcome.
export const FINANCE_VISIBLE_STATUSES: ReadonlyArray<WorkflowStatus> = [
  "Manager Approved",
  "Finance Review",
  "Finance Approved",
  "Posted to QuickBooks",
  "Ready for Payroll Reimbursement",
  "Paid Through Payroll",
  "Reconciled",
  "Sync Error",
  "Voided",
];

const FINANCE_VISIBLE_SET = new Set<WorkflowStatus>(FINANCE_VISIBLE_STATUSES);

export async function loadReportSummaries(
  reports: ExpenseReport[],
): Promise<ExpenseReportSummaryDto[]> {
  if (reports.length === 0) return [];
  const ids = reports.map((r) => r.id);
  const employeeIds = [...new Set(reports.map((r) => r.employeeId))];
  const departmentIds = [
    ...new Set(reports.map((r) => r.departmentId).filter(Boolean) as string[]),
  ];

  const [lines, receipts, employees, departments] = await Promise.all([
    db
      .select()
      .from(lineItemsTable)
      .where(inArray(lineItemsTable.reportId, ids)),
    db
      .select()
      .from(receiptsTable)
      .where(inArray(receiptsTable.reportId, ids)),
    db.select().from(usersTable).where(inArray(usersTable.id, employeeIds)),
    departmentIds.length > 0
      ? db
          .select()
          .from(departmentsTable)
          .where(inArray(departmentsTable.id, departmentIds))
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  const linesByReport = new Map<string, LineItem[]>();
  for (const line of lines) {
    const arr = linesByReport.get(line.reportId) ?? [];
    arr.push(line);
    linesByReport.set(line.reportId, arr);
  }
  const receiptsByReport = new Map<string, Receipt[]>();
  for (const r of receipts) {
    if (!r.reportId) continue;
    const arr = receiptsByReport.get(r.reportId) ?? [];
    arr.push(r);
    receiptsByReport.set(r.reportId, arr);
  }
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const departmentById = new Map(departments.map((d) => [d.id, d.name]));

  return reports.map((report) => {
    const reportLines = linesByReport.get(report.id) ?? [];
    const reportReceipts = receiptsByReport.get(report.id) ?? [];
    const receiptsByLine = new Map<string | null, number>();
    for (const r of reportReceipts) {
      const key = r.lineItemId ?? null;
      receiptsByLine.set(key, (receiptsByLine.get(key) ?? 0) + 1);
    }
    const rollup = rollupTotals(reportLines, receiptsByLine);
    const employee = employeeById.get(report.employeeId);
    return {
      id: report.id,
      displayCode: report.displayCode,
      title: report.title,
      employee: employee
        ? toUserRef(employee)
        : {
            id: report.employeeId,
            fullName: "Unknown",
            role: "Employee",
          },
      departmentName: report.departmentId
        ? departmentById.get(report.departmentId) ?? null
        : null,
      period: formatPeriod(report.periodStart, report.periodEnd),
      status: report.status,
      total: rollup.total,
      lineCount: rollup.lineCount,
      receiptCount: rollup.receiptCount,
      needsReceipt: rollup.needsReceipt,
      submittedAt: report.submittedAt?.toISOString() ?? null,
      ageDays: ageInDays(report.submittedAt, report.createdAt),
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  });
}

export async function loadFullReport(
  report: ExpenseReport,
): Promise<ExpenseReportDto> {
  const [summary] = await loadReportSummaries([report]);
  const [lines, receipts] = await Promise.all([
    db
      .select()
      .from(lineItemsTable)
      .where(eq(lineItemsTable.reportId, report.id)),
    db
      .select()
      .from(receiptsTable)
      .where(eq(receiptsTable.reportId, report.id)),
  ]);
  const receiptCountsByLine = new Map<string, number>();
  for (const r of receipts) {
    if (!r.lineItemId) continue;
    receiptCountsByLine.set(
      r.lineItemId,
      (receiptCountsByLine.get(r.lineItemId) ?? 0) + 1,
    );
  }
  return {
    ...summary,
    description: report.description,
    departmentId: report.departmentId,
    policy: report.policy,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    lineItems: lines.map((l) =>
      toLineItemDto(l, receiptCountsByLine.get(l.id) ?? 0),
    ),
    receipts: receipts.map(toReceiptDto),
  };
}

export async function fetchReportOrThrow(
  reportId: string,
  orgId: string,
): Promise<ExpenseReport> {
  const rows = await db
    .select()
    .from(expenseReportsTable)
    .where(
      and(
        eq(expenseReportsTable.id, reportId),
        eq(expenseReportsTable.orgId, orgId),
      ),
    )
    .limit(1);
  const report = rows[0];
  if (!report) {
    const err = new Error("Report not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  return report;
}

// Returns true if the caller may view the given report. Manager Approvers
// must be the direct manager of the report's employee — being a Manager
// Approver alone is not enough.
export async function canView(
  report: ExpenseReport,
  user: User,
): Promise<boolean> {
  if (report.orgId !== user.orgId) return false;
  if (user.role === "System Admin" || user.role === "Accounting Admin")
    return true;
  // The employee always sees their own report regardless of status.
  if (user.id === report.employeeId) return true;
  // Finance only sees reports that have at least cleared manager approval.
  // Drafts, Submitted, Manager Review, Changes Requested, and Rejected
  // reports are invisible to finance — they belong to the employee/manager
  // half of the workflow.
  if (user.role === "Finance Approver") {
    return FINANCE_VISIBLE_SET.has(report.status);
  }
  if (user.role === "Manager Approver") {
    const employee = await db
      .select({ managerId: usersTable.managerId })
      .from(usersTable)
      .where(eq(usersTable.id, report.employeeId))
      .limit(1);
    return employee[0]?.managerId === user.id;
  }
  return false;
}

// Async variant for action endpoints that ensures the caller has manager
// authority over the report's employee. Returns true for System Admin and
// Accounting Admin (which act org-wide).
export async function isReportManager(
  report: ExpenseReport,
  user: User,
): Promise<boolean> {
  if (report.orgId !== user.orgId) return false;
  if (user.role === "System Admin" || user.role === "Accounting Admin")
    return true;
  if (user.role !== "Manager Approver") return false;
  const employee = await db
    .select({ managerId: usersTable.managerId })
    .from(usersTable)
    .where(eq(usersTable.id, report.employeeId))
    .limit(1);
  return employee[0]?.managerId === user.id;
}

// Allocates the next display code for an org. Format: EXP-{yyMM}-{nnn}.
export async function nextDisplayCode(orgId: string): Promise<string> {
  const today = new Date();
  const prefix = `EXP-${today.getFullYear().toString().slice(2)}${(today.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-`;
  const existing = await db
    .select({ code: expenseReportsTable.displayCode })
    .from(expenseReportsTable)
    .where(eq(expenseReportsTable.orgId, orgId));
  let max = 0;
  for (const row of existing) {
    if (!row.code.startsWith("EXP-")) continue;
    const tail = row.code.slice(row.code.lastIndexOf("-") + 1);
    const num = parseInt(tail, 10);
    if (!Number.isNaN(num) && num > max) max = num;
  }
  return `${prefix}${(max + 1).toString().padStart(3, "0")}`;
}

