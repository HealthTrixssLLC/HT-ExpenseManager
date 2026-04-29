import { eq, max } from "drizzle-orm";
import {
  approvalActionsTable,
  db,
  expenseReportsTable,
  type ApprovalAction,
  type ExpenseReport,
  type Role,
  type WorkflowStatus,
} from "@workspace/db";
import { HttpError } from "../lib/problem";

export type Transition = {
  from: WorkflowStatus;
  to: WorkflowStatus;
  // Roles that can perform this transition.
  // "self" means the report's own employee.
  actors: ReadonlyArray<Role | "self">;
  // Human-readable name for error messages.
  name: string;
};

const T = (
  from: WorkflowStatus,
  to: WorkflowStatus,
  actors: ReadonlyArray<Role | "self">,
  name: string,
): Transition => ({ from, to, actors, name });

// State machine. The router's only job is to pick the right transition by name
// and call applyTransition() — which validates and writes the audit row.
export const TRANSITIONS = {
  submit: [
    T("Draft", "Submitted", ["self"], "submit"),
    T("Changes Requested", "Submitted", ["self"], "resubmit"),
  ],
  withdraw: [T("Submitted", "Draft", ["self"], "withdraw")],
  enterManagerReview: [
    T("Submitted", "Manager Review", ["Manager Approver"], "begin manager review"),
  ],
  managerApprove: [
    T("Submitted", "Manager Approved", ["Manager Approver", "System Admin"], "manager approve"),
    T(
      "Manager Review",
      "Manager Approved",
      ["Manager Approver", "System Admin"],
      "manager approve",
    ),
  ],
  managerRequestChanges: [
    T(
      "Submitted",
      "Changes Requested",
      ["Manager Approver", "System Admin"],
      "request changes",
    ),
    T(
      "Manager Review",
      "Changes Requested",
      ["Manager Approver", "System Admin"],
      "request changes",
    ),
  ],
  managerReject: [
    T("Submitted", "Rejected", ["Manager Approver", "System Admin"], "manager reject"),
    T("Manager Review", "Rejected", ["Manager Approver", "System Admin"], "manager reject"),
  ],
  enterFinanceReview: [
    T(
      "Manager Approved",
      "Finance Review",
      ["Finance Approver", "Accounting Admin", "System Admin"],
      "begin finance review",
    ),
  ],
  financeApprove: [
    T(
      "Manager Approved",
      "Finance Approved",
      ["Finance Approver", "Accounting Admin", "System Admin"],
      "finance approve",
    ),
    T(
      "Finance Review",
      "Finance Approved",
      ["Finance Approver", "Accounting Admin", "System Admin"],
      "finance approve",
    ),
  ],
  financeReject: [
    T(
      "Manager Approved",
      "Rejected",
      ["Finance Approver", "Accounting Admin", "System Admin"],
      "finance reject",
    ),
    T(
      "Finance Review",
      "Rejected",
      ["Finance Approver", "Accounting Admin", "System Admin"],
      "finance reject",
    ),
  ],
  postQbo: [
    T(
      "Finance Approved",
      "Posted to QuickBooks",
      ["Finance Approver", "Accounting Admin", "System Admin"],
      "post to QuickBooks",
    ),
  ],
  postQboError: [
    T(
      "Finance Approved",
      "Sync Error",
      ["Finance Approver", "Accounting Admin", "System Admin"],
      "QuickBooks sync error",
    ),
  ],
  retryQbo: [
    T(
      "Sync Error",
      "Posted to QuickBooks",
      ["Finance Approver", "Accounting Admin", "System Admin"],
      "retry QuickBooks post",
    ),
    T(
      "Sync Error",
      "Sync Error",
      ["Finance Approver", "Accounting Admin", "System Admin"],
      "retry QuickBooks post",
    ),
  ],
  readyForPayroll: [
    T(
      "Posted to QuickBooks",
      "Ready for Payroll Reimbursement",
      ["Finance Approver", "Accounting Admin", "System Admin"],
      "send to payroll",
    ),
  ],
  markPaid: [
    T(
      "Ready for Payroll Reimbursement",
      "Paid Through Payroll",
      ["Finance Approver", "Accounting Admin", "System Admin"],
      "mark paid",
    ),
  ],
  reconcile: [
    T(
      "Paid Through Payroll",
      "Reconciled",
      ["Finance Approver", "Accounting Admin", "System Admin"],
      "reconcile",
    ),
  ],
} as const satisfies Record<string, ReadonlyArray<Transition>>;

export type TransitionName = keyof typeof TRANSITIONS;

export type Actor = {
  id: string;
  role: Role;
};

export type ApplyTransitionInput = {
  report: ExpenseReport;
  actor: Actor;
  transition: TransitionName;
  comment?: string | null;
  metadata?: string | null;
  // When true, allow self-acting actors (the report's own employee). Used for
  // the "submit" / "withdraw" transitions.
  allowSelf?: boolean;
};

export type TransitionResult = {
  report: ExpenseReport;
  action: ApprovalAction;
};

export async function applyTransition(
  input: ApplyTransitionInput,
): Promise<TransitionResult> {
  const { report, actor, transition, comment, metadata, allowSelf } = input;
  const candidates = TRANSITIONS[transition];

  const match = candidates.find((c) => {
    if (c.from !== report.status) return false;
    return c.actors.some((a) => {
      if (a === "self") return allowSelf && actor.id === report.employeeId;
      return a === actor.role;
    });
  });

  if (!match) {
    throw new HttpError(
      409,
      "Invalid Transition",
      `Cannot ${transition} a report in status "${report.status}" as ${actor.role}.`,
    );
  }

  const result = await db.transaction(async (tx) => {
    const updateValues: Partial<ExpenseReport> = { status: match.to };
    if (transition === "submit" && report.status === "Draft") {
      updateValues.submittedAt = new Date();
    }
    const [updated] = await tx
      .update(expenseReportsTable)
      .set(updateValues)
      .where(eq(expenseReportsTable.id, report.id))
      .returning();

    const [{ value: lastSeq }] = await tx
      .select({ value: max(approvalActionsTable.sequence) })
      .from(approvalActionsTable)
      .where(eq(approvalActionsTable.reportId, report.id));

    const nextSequence = (lastSeq ?? 0) + 1;

    const [action] = await tx
      .insert(approvalActionsTable)
      .values({
        reportId: report.id,
        actorId: actor.id,
        actorRole: actor.role,
        fromStatus: match.from,
        toStatus: match.to,
        comment: comment ?? null,
        metadata: metadata ?? null,
        sequence: nextSequence,
      })
      .returning();

    return { report: updated, action };
  });

  return result;
}
