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

const MANAGER_ROLES = ["Manager Approver", "Accounting Admin", "System Admin"];

router.use(requireAuth);

router.get(
  "/manager/queue",
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const auth = req.auth!;
    const reports = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.managerId, auth.user.id));
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
  const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
  if (!(await isReportManager(report, req.auth!.user))) {
    sendProblem(
      res,
      403,
      "Forbidden",
      "Only the employee's direct manager can act on this report.",
    );
    return;
  }
  const result = await applyTransition({
    report,
    actor: { id: req.auth!.user.id, role: req.auth!.user.role },
    transition,
    comment: parsed.data.comment ?? null,
  });
  res.json(ExpenseReportResponse.parse(await loadFullReport(result.report)));
}

router.post(
  "/reports/:id/manager-approve",
  requireRole(...MANAGER_ROLES),
  (req, res) => transitionRoute(req, res, "managerApprove"),
);
router.post(
  "/reports/:id/manager-request-changes",
  requireRole(...MANAGER_ROLES),
  (req, res) => transitionRoute(req, res, "managerRequestChanges"),
);
router.post(
  "/reports/:id/manager-reject",
  requireRole(...MANAGER_ROLES),
  (req, res) => transitionRoute(req, res, "managerReject"),
);

function pathId(req: Request, key: string): string {
  const raw = (req.params as Record<string, string | string[]>)[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export default router;
