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
  GetGlEntryValidationResponse,
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
import {
  buildGlPreview,
  buildLiveJournalEntryForReport,
  ensureConnectionRow,
  loadAccountTypeMap,
  loadPostingEventForReport,
  postReportToQbo,
  validateJournalEntryPayload,
} from "../services/qbo";
import { logger } from "../lib/logger";

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

// GET /reports/:id/gl-entry-validation — validate the JournalEntry
// payload that the system would (or did) POST to Intuit's
// /v3/company/{realmId}/journalentry endpoint. When a postingEventId is
// supplied the persisted payload from qbo_posting_events is returned;
// otherwise the payload is rebuilt on the fly via buildGlPreview +
// buildJournalEntryPayload so the validation reflects what would be
// sent on the next post. Available to finance + accounting/system admins
// (the latter two are members of FINANCE_ROLES) so the QBO admin
// Posting History panel can reuse the same modal.
router.get(
  "/reports/:id/gl-entry-validation",
  requireRole(...FINANCE_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const orgId = req.auth!.user.orgId;
    const report = await fetchReportOrThrow(id, orgId);
    if (!(await canView(report, req.auth!.user))) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    const postingEventId =
      typeof req.query["postingEventId"] === "string"
        ? req.query["postingEventId"]
        : undefined;

    const conn = await ensureConnectionRow(orgId);

    let payload: Record<string, unknown>;
    let source: "posting_event" | "live_build";
    let environment = conn.environment;
    let realmId: string | null = conn.realmId ?? null;
    let journalId: string | null = null;
    let qboJournalId: string | null = null;
    let resolvedPostingEventId: string | null = null;

    if (postingEventId) {
      const event = await loadPostingEventForReport({
        postingEventId,
        reportId: report.id,
      });
      if (!event) {
        sendProblem(res, 404, "Not Found", "Posting event not found for this report.");
        return;
      }
      payload = (event.payload ?? {}) as Record<string, unknown>;
      source = "posting_event";
      environment = event.environment;
      realmId = event.realmId ?? null;
      journalId = event.journalId;
      qboJournalId = event.qboJournalId;
      resolvedPostingEventId = event.id;
    } else {
      // Live-build path: run the same pre-send pipeline the poster
      // would run (account-type resolution + Vendor attachment for
      // AP/AR lines), so the validator's checklist matches what would
      // actually be sent to Intuit on the next post.
      const live = await buildLiveJournalEntryForReport(report);
      payload = live.payload;
      source = "live_build";
      if (!live.enriched && live.enrichmentSkippedReason) {
        // Surface the reason as a server-side log; the validator's own
        // ap-ar-entity check downgrades to "warn" when account types
        // are unknown, which is the right UX-level signal.
        logger.info(
          { reportId: report.id, reason: live.enrichmentSkippedReason },
          "Live JournalEntry validation: enrichment skipped",
        );
      }
    }

    // The account-type cache may have been warmed by the live-build
    // path above; re-read it after enrichment so the validator sees
    // any freshly-fetched AccountType values.
    const accountTypeById = await loadAccountTypeMap(orgId);
    const validated = validateJournalEntryPayload(payload, accountTypeById);

    // Pull the JournalEntry header back out of the (possibly persisted)
    // payload so the modal header info reflects what Intuit would see —
    // not what buildGlPreview *now* would compute (the cached payload
    // is the source of truth for past attempts).
    const je = (payload["JournalEntry"] ?? {}) as Record<string, unknown>;
    const journalDate =
      typeof je["TxnDate"] === "string" ? (je["TxnDate"] as string) : "";
    const memo =
      typeof je["PrivateNote"] === "string" ? (je["PrivateNote"] as string) : "";
    const currencyRef =
      je["CurrencyRef"] && typeof je["CurrencyRef"] === "object"
        ? (je["CurrencyRef"] as Record<string, unknown>)
        : {};
    const currency =
      typeof currencyRef["value"] === "string"
        ? (currencyRef["value"] as string)
        : "USD";

    res.json(
      GetGlEntryValidationResponse.parse({
        reportId: report.id,
        reportDisplayCode: report.displayCode,
        journalDate,
        memo,
        currency,
        environment,
        realmId,
        journalId,
        qboJournalId,
        postingEventId: resolvedPostingEventId,
        source,
        lines: validated.lines,
        totalDebits: validated.totalDebits,
        totalCredits: validated.totalCredits,
        balanced: validated.balanced,
        checks: validated.checks,
        rawPayload: payload,
      }),
    );
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
      // Auto-advance to Ready for Payroll Reimbursement so the payroll
      // queue picks it up. This is a convenience step — the QBO post
      // already succeeded and the journal entry exists in QuickBooks.
      // If the auto-advance throws (illegal transition from a concurrent
      // edit, validation, etc.) we MUST NOT 5xx the request: that would
      // surface as "push failed" in the UI even though Intuit accepted
      // the entry. Degrade gracefully — leave the report at "Posted to
      // QuickBooks", log a warning, and still return success with the
      // journal id so finance can send to payroll manually.
      let final = result.report;
      try {
        const advanced = await applyTransition({
          report: result.report,
          actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
          transition: "readyForPayroll",
          metadata: JSON.stringify({ journalId: post.journalId }),
        });
        final = advanced.report;
      } catch (advanceErr) {
        logger.warn(
          { err: advanceErr, reportId: report.id, journalId: post.journalId },
          "QBO post succeeded but auto-advance to Ready for Payroll Reimbursement failed; leaving report at Posted to QuickBooks",
        );
      }
      res.json(
        PostToQuickbooksResponse.parse({
          report: await loadFullReport(final),
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
    // Same auto-advance decoupling as post-to-qbo above: don't 5xx
    // a successful retry just because the convenience advance throws.
    let final = result.report;
    try {
      const advanced = await applyTransition({
        report: result.report,
        actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
        transition: "readyForPayroll",
      });
      final = advanced.report;
    } catch (advanceErr) {
      logger.warn(
        { err: advanceErr, reportId: report.id, journalId: post.journalId },
        "QBO retry succeeded but auto-advance to Ready for Payroll Reimbursement failed; leaving report at Posted to QuickBooks",
      );
    }
    res.json(
      PostToQuickbooksResponse.parse({
        report: await loadFullReport(final),
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
