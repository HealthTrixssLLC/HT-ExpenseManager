import { and, desc, eq, inArray } from "drizzle-orm";
import {
  approvalActionsTable,
  auditEntriesTable,
  db,
  departmentsTable,
  expenseReportsTable,
  lineItemsTable,
  managerDelegationsTable,
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
import { HttpError } from "./problem";

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

// Statuses in which a report's content (header, line items, receipts) is
// editable. The lock at "Finance Approved" is firm: once the report has
// been finance approved, every later status (Posted to QuickBooks, Ready
// for Payroll Reimbursement, Paid Through Payroll, Reconciled, Sync
// Error, Voided) is read-only. Rejected is similarly terminal — the
// reviewer's call has been made and content can't be retroactively
// rewritten.
export const EDITABLE_STATUSES: ReadonlyArray<WorkflowStatus> = [
  "Draft",
  "Submitted",
  "Manager Review",
  "Changes Requested",
  "Manager Approved",
  "Finance Review",
];

const EDITABLE_STATUSES_SET = new Set<WorkflowStatus>(EDITABLE_STATUSES);

export function isReportContentEditable(status: WorkflowStatus): boolean {
  return EDITABLE_STATUSES_SET.has(status);
}

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
            roles: ["Employee"] as const,
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
  const editedSinceLastApproval = await wasEditedSinceLastApproval(report.id);
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
    editedSinceLastApproval,
  };
}

// Returns true when the report has at least one content edit recorded
// after its most recent approval action. When no approvals have happened
// yet there is nothing to "post-date" so we report false (the banner
// only matters once a reviewer has acted).
export async function wasEditedSinceLastApproval(
  reportId: string,
): Promise<boolean> {
  const lastApproval = (
    await db
      .select({ createdAt: approvalActionsTable.createdAt })
      .from(approvalActionsTable)
      .where(eq(approvalActionsTable.reportId, reportId))
      .orderBy(desc(approvalActionsTable.createdAt))
      .limit(1)
  )[0];
  if (!lastApproval) return false;
  const lastEdit = (
    await db
      .select({ createdAt: auditEntriesTable.createdAt })
      .from(auditEntriesTable)
      .where(eq(auditEntriesTable.reportId, reportId))
      .orderBy(desc(auditEntriesTable.createdAt))
      .limit(1)
  )[0];
  if (!lastEdit) return false;
  return lastEdit.createdAt.getTime() > lastApproval.createdAt.getTime();
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
    throw new HttpError(404, "Not Found", "Report not found in this organization.");
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
  if (user.roles.includes("System Admin") || user.roles.includes("Accounting Admin"))
    return true;
  // The employee always sees their own report regardless of status.
  if (user.id === report.employeeId) return true;
  // Finance only sees reports that have at least cleared manager approval.
  // Drafts, Submitted, Manager Review, Changes Requested, and Rejected
  // reports are invisible to finance — they belong to the employee/manager
  // half of the workflow.
  if (user.roles.includes("Finance Approver")) {
    if (FINANCE_VISIBLE_SET.has(report.status)) return true;
  }
  if (user.roles.includes("Manager Approver")) {
    if (await isManagerOrDelegateOf(report.employeeId, user)) return true;
  }
  return false;
}

// Edit-authorization for content mutations on a report. Returns
// `{ ok: true }` when the caller may edit, `{ ok: false, status, detail }`
// otherwise so the caller can propagate the right HTTP response without
// guessing.
//
// The owner can always edit their own report. Their direct manager can
// edit it too — and if a manager is currently delegating their queue to
// another manager, that delegate inherits the same edit rights for the
// duration of the delegation. Admins (System / Accounting) act org-wide.
//
// Edit access is *separately* gated by the report's status: even an
// authorized caller is denied when the report is past Finance Approved.
// We perform the role check first so we don't leak status information to
// unauthorized callers.
export type EditAuthResult =
  | { ok: true }
  | { ok: false; status: number; title: string; detail: string };

export async function canEditReport(
  report: ExpenseReport,
  user: User,
): Promise<EditAuthResult> {
  const orgMatches = report.orgId === user.orgId;
  if (!orgMatches) {
    return { ok: false, status: 403, title: "Forbidden", detail: "Report not in your organization." };
  }
  // Per Task #25: ONLY the report owner, their direct manager, or an
  // active delegate of that manager may edit a report's content. Admin
  // roles (System Admin / Accounting Admin) intentionally do NOT have
  // edit rights here — administrative changes go through dedicated
  // admin tooling, not by impersonating the owner on financial records.
  const isOwner = user.id === report.employeeId;
  let isManagerOrDelegate = false;
  if (!isOwner) {
    isManagerOrDelegate = await isManagerOrDelegateOf(report.employeeId, user);
  }
  if (!isOwner && !isManagerOrDelegate) {
    return {
      ok: false,
      status: 403,
      title: "Forbidden",
      detail: "Only the report owner or their manager can edit this report.",
    };
  }
  if (!isReportContentEditable(report.status)) {
    return {
      ok: false,
      status: 409,
      title: "Locked",
      detail: `Cannot edit a report in status "${report.status}".`,
    };
  }
  return { ok: true };
}

// True if `user` is the direct manager of the employee with id
// `employeeId`, OR holds an active manager_delegations row from that
// employee's direct manager. Used by the edit-authorization gate so
// delegates inherit edit rights for the duration of the delegation.
export async function isManagerOrDelegateOf(
  employeeId: string,
  user: User,
): Promise<boolean> {
  if (!user.roles.includes("Manager Approver")) return false;
  const employee = (
    await db
      .select({ managerId: usersTable.managerId, orgId: usersTable.orgId })
      .from(usersTable)
      .where(eq(usersTable.id, employeeId))
      .limit(1)
  )[0];
  if (!employee || employee.orgId !== user.orgId) return false;
  if (!employee.managerId) return false;
  if (employee.managerId === user.id) return true;
  // Delegated authority: an active row from the employee's manager TO this
  // user authorizes the same edit rights as the manager themselves.
  const now = new Date();
  const rows = await db
    .select()
    .from(managerDelegationsTable)
    .where(
      and(
        eq(managerDelegationsTable.orgId, user.orgId),
        eq(managerDelegationsTable.fromManagerId, employee.managerId),
        eq(managerDelegationsTable.toManagerId, user.id),
      ),
    );
  return rows.some(
    (r) =>
      r.revokedAt === null &&
      r.startsAt <= now &&
      (r.endsAt === null || r.endsAt > now),
  );
}

// Async variant for action endpoints that ensures the caller has manager
// authority over the report's employee. Returns true for System Admin and
// Accounting Admin (which act org-wide).
export async function isReportManager(
  report: ExpenseReport,
  user: User,
): Promise<boolean> {
  if (report.orgId !== user.orgId) return false;
  if (user.roles.includes("System Admin") || user.roles.includes("Accounting Admin"))
    return true;
  if (!user.roles.includes("Manager Approver")) return false;
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

