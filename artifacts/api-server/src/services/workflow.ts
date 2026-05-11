/**
 * Expense-report workflow state machine.
 *
 * `TRANSITIONS` is the canonical map from a transition name (`submit`,
 * `managerApprove`, `postQbo`, …) to the legal `(from, to, actors)` triples.
 * Routes call `applyTransition({ report, actor, transition, ... })`, which:
 *   1. Picks the first triple whose `from` matches the report's status and
 *      whose `actors` include the actor's role (or `"self"` for the owner).
 *   2. Updates `expense_reports.status` (and `submittedAt` on first submit).
 *   3. Inserts an `approval_actions` audit row with the next sequence number.
 *
 * Pass `tx` to participate in an outer transaction (used by payroll batch
 * operations that mark many reports paid atomically).
 */
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
  // Voiding terminates a report short of payment. Owner can void from
  // editable statuses; Accounting Admin / System Admin can void anything
  // before money has gone out the door.
  voidReport: [
    T("Draft", "Voided", ["self", "Accounting Admin", "System Admin"], "void"),
    T(
      "Changes Requested",
      "Voided",
      ["self", "Accounting Admin", "System Admin"],
      "void",
    ),
    T("Submitted", "Voided", ["Accounting Admin", "System Admin"], "void"),
    T("Manager Review", "Voided", ["Accounting Admin", "System Admin"], "void"),
    T(
      "Manager Approved",
      "Voided",
      ["Accounting Admin", "System Admin"],
      "void",
    ),
    T(
      "Finance Review",
      "Voided",
      ["Accounting Admin", "System Admin"],
      "void",
    ),
    T(
      "Finance Approved",
      "Voided",
      ["Accounting Admin", "System Admin"],
      "void",
    ),
    T("Sync Error", "Voided", ["Accounting Admin", "System Admin"], "void"),
  ],
} as const satisfies Record<string, ReadonlyArray<Transition>>;

export type TransitionName = keyof typeof TRANSITIONS;

export type Actor = {
  id: string;
  roles: Role[];
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
  // Optional ambient transaction. When supplied, applyTransition writes
  // through this tx instead of opening its own — letting callers like
  // POST /payroll/batches/:id/mark-paid wrap many transitions + a batch
  // update in a single all-or-nothing transaction.
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0];
};

export type TransitionResult = {
  report: ExpenseReport;
  action: ApprovalAction;
};

// Test-only seam: lets the route-level test suite simulate a
// post-QBO auto-advance failure (e.g. an illegal transition caused
// by a concurrent edit) without having to mock a frozen ESM export
// or wire a fake DB trigger. The hook returns an Error to throw, or
// null to fall through to normal behavior. Production code never
// touches this — `__setTestApplyTransitionHook(null)` resets it.
type ApplyTransitionTestHook = (input: ApplyTransitionInput) => Error | null;
let _testApplyTransitionHook: ApplyTransitionTestHook | null = null;
export function __setTestApplyTransitionHook(
  hook: ApplyTransitionTestHook | null,
): void {
  // Hard guard: never allow installing the hook in production. Even
  // though no production code path calls this, this is defense in
  // depth so a stray import can't accidentally short-circuit the
  // workflow engine in a deployed environment.
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "__setTestApplyTransitionHook is a test-only seam and must not be used in production",
    );
  }
  _testApplyTransitionHook = hook;
}

export async function applyTransition(
  input: ApplyTransitionInput,
): Promise<TransitionResult> {
  if (_testApplyTransitionHook) {
    const forced = _testApplyTransitionHook(input);
    if (forced) throw forced;
  }
  const { report, actor, transition, comment, metadata, allowSelf, tx: ambientTx } = input;
  const candidates = TRANSITIONS[transition];

  const match = candidates.find((c) => {
    if (c.from !== report.status) return false;
    return c.actors.some((a) => {
      if (a === "self") return allowSelf && actor.id === report.employeeId;
      return actor.roles.includes(a);
    });
  });

  if (!match) {
    throw new HttpError(
      409,
      "Invalid Transition",
      `Cannot ${transition} a report in status "${report.status}" as ${actor.roles.join(", ")}.`,
    );
  }

  const run = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ): Promise<TransitionResult> => {
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
        actorRoles: actor.roles,
        fromStatus: match.from,
        toStatus: match.to,
        comment: comment ?? null,
        metadata: metadata ?? null,
        sequence: nextSequence,
      })
      .returning();

    return { report: updated, action };
  };

  return ambientTx ? run(ambientTx) : db.transaction(run);
}
