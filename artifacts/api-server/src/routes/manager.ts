import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  ManagerApproveBody as ApprovalActionBody,
  GetReportResponse as ExpenseReportResponse,
  ManagerQueueResponse,
} from "@workspace/api-zod";
import { db, expenseReportsTable, usersTable } from "../lib/db";
import { sendProblem } from "../lib/problem";
import { requireAuth, requireRole } from "../middlewares/session";
import {
  fetchReportOrThrow,
  isReportManager,
  loadFullReport,
  loadReportSummaries,
} from "../lib/reports";
import { applyTransition, type TransitionName } from "../services/workflow";

const router: IRouter = Router();

// Spec: only Manager Approver (and System Admin as escalation) act on the
// manager queue. Accounting Admin owns finance/admin surface, not approvals.
const MANAGER_ROLES = ["Manager Approver", "System Admin"];

router.use(requireAuth);

// Resolve the effective manager id for queue/action endpoints. If the request
// has `?delegateOf=<userId>`, the caller is acting on behalf of that other
// manager. Both caller and target must be Manager Approvers in the same org
// (System Admin may delegate too). Returns the user id whose direct reports
// should drive queue / authorization, plus the delegate target user (or null
// if the caller is acting as themselves) so audit trails can stamp it.
async function resolveDelegate(
  req: Request,
): Promise<
  | { ok: true; effectiveManagerId: string; delegateOfUserId: string | null }
  | { ok: false; status: number; title: string; detail: string }
> {
  const auth = req.auth!;
  const raw = (req.query as Record<string, unknown>)["delegateOf"];
  if (raw === undefined || raw === "" || raw === null) {
    return { ok: true, effectiveManagerId: auth.user.id, delegateOfUserId: null };
  }
  const delegateOf = Array.isArray(raw) ? String(raw[0]) : String(raw);
  if (delegateOf === auth.user.id) {
    return { ok: true, effectiveManagerId: auth.user.id, delegateOfUserId: null };
  }
  const targetRows = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, delegateOf), eq(usersTable.orgId, auth.user.orgId)))
    .limit(1);
  const target = targetRows[0];
  if (!target) {
    return {
      ok: false,
      status: 404,
      title: "Not Found",
      detail: "delegateOf user not found in this org.",
    };
  }
  if (target.role !== "Manager Approver" && target.role !== "System Admin") {
    return {
      ok: false,
      status: 400,
      title: "Invalid Delegate",
      detail: "delegateOf must be a Manager Approver or System Admin.",
    };
  }
  return {
    ok: true,
    effectiveManagerId: target.id,
    delegateOfUserId: target.id,
  };
}

router.get(
  "/approvals/manager-queue",
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const auth = req.auth!;
    const delegate = await resolveDelegate(req);
    if (!delegate.ok) {
      sendProblem(res, delegate.status, delegate.title, delegate.detail);
      return;
    }
    const reports = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.managerId, delegate.effectiveManagerId));
    const ids = reports.map((r) => r.id);
    if (ids.length === 0) {
      res.json([]);
      return;
    }
    const rows = await db
      .select()
      .from(expenseReportsTable)
      .where(
        and(
          eq(expenseReportsTable.orgId, auth.user.orgId),
          inArray(expenseReportsTable.employeeId, ids),
          or(
            eq(expenseReportsTable.status, "Submitted"),
            eq(expenseReportsTable.status, "Manager Review"),
          ),
        ),
      )
      .orderBy(desc(expenseReportsTable.submittedAt));
    res.json(ManagerQueueResponse.parse(await loadReportSummaries(rows)));
  },
);

async function transitionRoute(
  req: Request,
  res: Response,
  transition: TransitionName,
): Promise<void> {
  const id = pathId(req, "id");
  const parsed = ApprovalActionBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendProblem(res, 400, "Invalid Body", parsed.error.message);
    return;
  }
  const delegate = await resolveDelegate(req);
  if (!delegate.ok) {
    sendProblem(res, delegate.status, delegate.title, delegate.detail);
    return;
  }
  const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
  // Authorization: either the caller IS the report's direct manager, or the
  // caller has delegated authority from someone who is. System Admin always
  // passes via isReportManager.
  let allowed = await isReportManager(report, req.auth!.user);
  if (!allowed && delegate.delegateOfUserId) {
    const owner = (
      await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, report.employeeId))
        .limit(1)
    )[0];
    if (owner && owner.managerId === delegate.delegateOfUserId) {
      allowed = true;
    }
  }
  if (!allowed) {
    sendProblem(
      res,
      403,
      "Forbidden",
      "Only the employee's direct manager (or a delegate) can act on this report.",
    );
    return;
  }
  const metadata = delegate.delegateOfUserId
    ? JSON.stringify({ delegateOf: delegate.delegateOfUserId })
    : null;
  const result = await applyTransition({
    report,
    actor: { id: req.auth!.user.id, role: req.auth!.user.role },
    transition,
    comment: parsed.data.comment ?? null,
    metadata,
  });
  res.json(ExpenseReportResponse.parse(await loadFullReport(result.report)));
}

router.post(
  "/reports/:id/manager-approve",
  requireRole(...MANAGER_ROLES),
  (req, res) => transitionRoute(req, res, "managerApprove"),
);
router.post(
  "/reports/:id/request-changes",
  requireRole(...MANAGER_ROLES),
  (req, res) => transitionRoute(req, res, "managerRequestChanges"),
);
router.post(
  "/reports/:id/reject",
  requireRole(...MANAGER_ROLES),
  (req, res) => transitionRoute(req, res, "managerReject"),
);

function pathId(req: Request, key: string): string {
  const raw = (req.params as Record<string, string | string[]>)[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export default router;
