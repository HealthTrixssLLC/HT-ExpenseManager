import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { and, desc, eq, or } from "drizzle-orm";
import {
  FinanceApproveBody as ApprovalActionBody,
  GetReportResponse as ExpenseReportResponse,
  FinanceQueueResponse,
  GetGlPreviewResponse,
  PostToQuickbooksResponse,
} from "@workspace/api-zod";
import { db, expenseReportsTable } from "../lib/db";
import { requireAuth, requireRole } from "../middlewares/session";
import { sendProblem } from "../lib/problem";
import {
  canView,
  fetchReportOrThrow,
  loadFullReport,
  loadReportSummaries,
} from "../lib/reports";
import { applyTransition, type TransitionName } from "../services/workflow";
import { buildGlPreview, ensureConnectionRow, postReportToQbo } from "../services/qbo";

const router: IRouter = Router();

const FINANCE_ROLES = [
  "Finance Approver",
  "Accounting Admin",
  "System Admin",
];

router.use(requireAuth);

router.get(
  "/approvals/finance-queue",
  requireRole(...FINANCE_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const rows = await db
      .select()
      .from(expenseReportsTable)
      .where(
        and(
          eq(expenseReportsTable.orgId, orgId),
          or(
            eq(expenseReportsTable.status, "Manager Approved"),
            eq(expenseReportsTable.status, "Finance Review"),
            eq(expenseReportsTable.status, "Finance Approved"),
            eq(expenseReportsTable.status, "Sync Error"),
          ),
        ),
      )
      .orderBy(desc(expenseReportsTable.submittedAt));
    res.json(FinanceQueueResponse.parse(await loadReportSummaries(rows)));
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
  const result = await applyTransition({
    report,
    actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
    transition,
    comment: parsed.data.comment ?? null,
  });
  res.json(ExpenseReportResponse.parse(await loadFullReport(result.report)));
}

router.post(
  "/reports/:id/finance-approve",
  requireRole(...FINANCE_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const parsed = ApprovalActionBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const orgId = req.auth!.user.orgId;
    const report = await fetchReportOrThrow(id, orgId);

    // 1) Apply the financeApprove transition.
    const result = await applyTransition({
      report,
      actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
      transition: "financeApprove",
      comment: parsed.data.comment ?? null,
    });

    // 2) If the org has opted into autoPostOnApproval, immediately
    //    chain through post-to-qbo + ready-for-payroll. Failures here
    //    don't roll back the financeApprove — the report just stays
    //    in "Finance Approved" so finance can retry the post manually
    //    from the queue. We still return the (possibly advanced) report
    //    so the UI reflects the new status.
    let final = result.report;
    const conn = await ensureConnectionRow(orgId);
    if (conn.autoPostOnApproval) {
      try {
        const post = await postReportToQbo(final);
        if (post.status !== "error") {
          const posted = await applyTransition({
            report: final,
            actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
            transition: "postQbo",
            comment: "Auto-posted via Posting Preferences (autoPostOnApproval).",
            metadata: JSON.stringify({
              journalId: post.journalId,
              autoPosted: true,
            }),
          });
          final = posted.report;
          const advanced = await applyTransition({
            report: final,
            actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
            transition: "readyForPayroll",
            comment: null,
          });
          final = advanced.report;
        }
        // status === "error" → just leave the report at Finance Approved;
        // postReportToQbo already wrote the posting_event + Sync Error
        // line items, and finance can retry from the queue.
      } catch (err) {
        // Don't surface as a 500 — finance approval already succeeded.
        console.warn("autoPostOnApproval chain failed", err);
      }
    }

    res.json(ExpenseReportResponse.parse(await loadFullReport(final)));
  },
);
router.post(
  "/reports/:id/finance-reject",
  requireRole(...FINANCE_ROLES),
  (req, res) => transitionRoute(req, res, "financeReject"),
);

router.get(
  "/reports/:id/gl-preview",
  requireRole(...FINANCE_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    // Same row-level access enforcement as /reports/:id — without this, a
    // Finance Approver who guesses a Draft report id would get its GL.
    if (!(await canView(report, req.auth!.user))) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    res.json(GetGlPreviewResponse.parse(await buildGlPreview(report)));
  },
);

router.post(
  "/reports/:id/post-to-qbo",
  requireRole(...FINANCE_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    if (report.status !== "Finance Approved") {
      sendProblem(
        res,
        409,
        "Invalid Transition",
        `Report must be Finance Approved (got "${report.status}").`,
      );
      return;
    }
    const post = await postReportToQbo(report);
    if (post.status !== "error") {
      const result = await applyTransition({
        report,
        actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
        transition: "postQbo",
        comment: typeof req.body?.comment === "string" ? req.body.comment : null,
        metadata: JSON.stringify({ journalId: post.journalId }),
      });
      // Auto-advance to Ready for Payroll Reimbursement so payroll queue picks it up.
      const advanced = await applyTransition({
        report: result.report,
        actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
        transition: "readyForPayroll",
        metadata: JSON.stringify({ journalId: post.journalId }),
      });
      res.json(
        PostToQuickbooksResponse.parse({
          report: await loadFullReport(advanced.report),
          journalId: post.journalId,
          status: "posted",
          errorMessage: null,
        }),
      );
      return;
    }
    const result = await applyTransition({
      report,
      actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
      transition: "postQboError",
      comment: post.errorMessage,
      metadata: JSON.stringify({ errorMessage: post.errorMessage }),
    });
    res.json(
      PostToQuickbooksResponse.parse({
        report: await loadFullReport(result.report),
        journalId: null,
        status: "error",
        errorMessage: post.errorMessage,
      }),
    );
  },
);

router.post(
  "/reports/:id/retry-qbo",
  requireRole(...FINANCE_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    if (report.status !== "Sync Error") {
      sendProblem(
        res,
        409,
        "Invalid Transition",
        `Only Sync Error reports can be retried.`,
      );
      return;
    }
    const post = await postReportToQbo(report, {
      forceSuccess: true,
      retry: true,
    });
    if (post.status === "error") {
      sendProblem(res, 502, "QBO Error", post.errorMessage);
      return;
    }
    const result = await applyTransition({
      report,
      actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
      transition: "retryQbo",
      metadata: JSON.stringify({ journalId: post.journalId }),
    });
    const advanced = await applyTransition({
      report: result.report,
      actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
      transition: "readyForPayroll",
    });
    res.json(
      PostToQuickbooksResponse.parse({
        report: await loadFullReport(advanced.report),
        journalId: post.journalId,
        status: "posted",
        errorMessage: null,
      }),
    );
  },
);

function pathId(req: Request, key: string): string {
  const raw = (req.params as Record<string, string | string[]>)[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export default router;
