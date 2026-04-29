import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  CreatePayrollBatchBody,
  GetPayrollBatchResponse,
  ListPayrollBatchesResponse,
  PayrollQueueResponse,
  ReconcilePayrollBatchBody as ReconcileBatchBody,
} from "@workspace/api-zod";
import {
  db,
  expenseReportsTable,
  payrollBatchItemsTable,
  payrollBatchesTable,
  reconciliationRecordsTable,
  type PayrollBatch,
  type PayrollBatchItem,
} from "../lib/db";
import { sendProblem } from "../lib/problem";
import { requireAuth, requireRole } from "../middlewares/session";
import { loadReportSummaries } from "../lib/reports";
import {
  toReconciliationDto,
  type ExpenseReportSummaryDto,
  type PayrollBatchDto,
  type PayrollBatchItemDto,
} from "../lib/serializers";
import { applyTransition } from "../services/workflow";

const router: IRouter = Router();

const PAYROLL_ROLES = [
  "Finance Approver",
  "Accounting Admin",
  "System Admin",
];

router.use(requireAuth);

router.get(
  "/payroll/queue",
  requireRole(...PAYROLL_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const rows = await db
      .select()
      .from(expenseReportsTable)
      .where(
        and(
          eq(expenseReportsTable.orgId, orgId),
          eq(expenseReportsTable.status, "Ready for Payroll Reimbursement"),
        ),
      )
      .orderBy(desc(expenseReportsTable.updatedAt));
    res.json(PayrollQueueResponse.parse(await loadReportSummaries(rows)));
  },
);

async function loadBatchDto(batch: PayrollBatch): Promise<PayrollBatchDto> {
  const items = await db
    .select()
    .from(payrollBatchItemsTable)
    .where(eq(payrollBatchItemsTable.batchId, batch.id))
    .orderBy(asc(payrollBatchItemsTable.createdAt));
  const reportIds = items.map((i) => i.reportId);
  const reports = reportIds.length
    ? await db
        .select()
        .from(expenseReportsTable)
        .where(inArray(expenseReportsTable.id, reportIds))
    : [];
  const summaries = await loadReportSummaries(reports);
  const summaryById = new Map<string, ExpenseReportSummaryDto>(
    summaries.map((s) => [s.id, s]),
  );
  const itemDtos: PayrollBatchItemDto[] = items.map((i: PayrollBatchItem) => ({
    id: i.id,
    reportId: i.reportId,
    amount: i.amount,
    report: summaryById.get(i.reportId)!,
  }));
  const total = itemDtos
    .reduce((acc, i) => acc + Math.round(parseFloat(i.amount) * 100), 0);

  const recRows = await db
    .select()
    .from(reconciliationRecordsTable)
    .where(eq(reconciliationRecordsTable.batchId, batch.id));

  return {
    id: batch.id,
    label: batch.label,
    status: batch.status,
    total: (total / 100).toFixed(2),
    paidAt: batch.paidAt?.toISOString() ?? null,
    reconciledAt: batch.reconciledAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    items: itemDtos,
    reconciliation: recRows.map(toReconciliationDto),
  };
}

router.get(
  "/payroll/batches",
  requireRole(...PAYROLL_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const batches = await db
      .select()
      .from(payrollBatchesTable)
      .where(eq(payrollBatchesTable.orgId, orgId))
      .orderBy(desc(payrollBatchesTable.createdAt));
    const dtos = await Promise.all(batches.map((b) => loadBatchDto(b)));
    res.json(ListPayrollBatchesResponse.parse(dtos));
  },
);

router.post(
  "/payroll/batches",
  requireRole(...PAYROLL_ROLES),
  async (req, res): Promise<void> => {
    const parsed = CreatePayrollBatchBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const orgId = req.auth!.user.orgId;

    // Collect EVERY report currently Ready for Payroll Reimbursement in this
    // org. The client does not supply ids — the queue itself is the input,
    // which matches the mockup workflow ("Create batch from queue").
    const reports = await db
      .select()
      .from(expenseReportsTable)
      .where(
        and(
          eq(expenseReportsTable.orgId, orgId),
          eq(expenseReportsTable.status, "Ready for Payroll Reimbursement"),
        ),
      );

    if (reports.length === 0) {
      sendProblem(
        res,
        409,
        "Empty Queue",
        "No reports are currently Ready for Payroll Reimbursement.",
      );
      return;
    }

    const summariesArr = await loadReportSummaries(reports);
    const summaryById = new Map(summariesArr.map((s) => [s.id, s]));

    const batch = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(payrollBatchesTable)
        .values({
          orgId,
          label: parsed.data.label,
          createdById: req.auth!.user.id,
        })
        .returning();
      for (const r of reports) {
        const summary = summaryById.get(r.id);
        await tx.insert(payrollBatchItemsTable).values({
          batchId: created.id,
          reportId: r.id,
          amount: summary?.total ?? "0.00",
        });
      }
      return created;
    });
    res.status(201).json(GetPayrollBatchResponse.parse(await loadBatchDto(batch)));
  },
);

router.get(
  "/payroll/batches/:id",
  requireRole(...PAYROLL_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const batch = await loadBatch(id, req.auth!.user.orgId);
    if (!batch) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    res.json(GetPayrollBatchResponse.parse(await loadBatchDto(batch)));
  },
);

router.post(
  "/payroll/batches/:id/mark-paid",
  requireRole(...PAYROLL_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const batch = await loadBatch(id, req.auth!.user.orgId);
    if (!batch) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    if (batch.status !== "Draft") {
      sendProblem(
        res,
        409,
        "Invalid Transition",
        `Batch is already ${batch.status}.`,
      );
      return;
    }
    const items = await db
      .select()
      .from(payrollBatchItemsTable)
      .where(eq(payrollBatchItemsTable.batchId, batch.id));
    const reportIds = items.map((i) => i.reportId);
    const reports = reportIds.length
      ? await db
          .select()
          .from(expenseReportsTable)
          .where(inArray(expenseReportsTable.id, reportIds))
      : [];
    // Wrap every per-report transition AND the batch update in a single
    // transaction — if any one report can't transition, the entire mark-paid
    // is rolled back, so we never end up with a half-paid batch.
    const updated = await db.transaction(async (tx) => {
      for (const r of reports) {
        await applyTransition({
          report: r,
          actor: { id: req.auth!.user.id, role: req.auth!.user.role },
          transition: "markPaid",
          metadata: JSON.stringify({ batchId: batch.id }),
          tx,
        });
      }
      const [u] = await tx
        .update(payrollBatchesTable)
        .set({ status: "Marked Paid", paidAt: new Date() })
        .where(eq(payrollBatchesTable.id, batch.id))
        .returning();
      return u;
    });
    res.json(GetPayrollBatchResponse.parse(await loadBatchDto(updated)));
  },
);

router.post(
  "/payroll/batches/:id/reconcile",
  requireRole(...PAYROLL_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const parsed = ReconcileBatchBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const batch = await loadBatch(id, req.auth!.user.orgId);
    if (!batch) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    if (batch.status !== "Marked Paid") {
      sendProblem(
        res,
        409,
        "Invalid Transition",
        `Batch must be Marked Paid (got "${batch.status}").`,
      );
      return;
    }
    const items = await db
      .select()
      .from(payrollBatchItemsTable)
      .where(eq(payrollBatchItemsTable.batchId, batch.id));
    const itemByReport = new Map(items.map((i) => [i.reportId, i] as const));
    const reportIds = items.map((i) => i.reportId);
    const reports = reportIds.length
      ? await db
          .select()
          .from(expenseReportsTable)
          .where(inArray(expenseReportsTable.id, reportIds))
      : [];
    const reportById = new Map(reports.map((r) => [r.id, r] as const));

    // CONTRACT: This endpoint only writes reconciliation rows for the
    // reports actually included in `entries`. Reports that belong to the
    // batch but are absent from the payload are intentionally treated as
    // "no information yet" rather than implicitly $0 / `missing`. Clients
    // that want every batch report flagged must POST an entry for every
    // report (use `paidAmount: "0.00"` to record a true missing payment).
    //
    // Build per-entry flag, persist a reconciliation record for every entry,
    // and remember which reports came out matched so we can transition only
    // those to "Reconciled".
    const matchedReportIds = new Set<string>();
    await db.transaction(async (tx) => {
      for (const entry of parsed.data.entries) {
        const item = itemByReport.get(entry.reportId);
        if (!item) continue;
        const expectedCents = Math.round(parseFloat(item.amount) * 100);
        const paidCents = Math.round(parseFloat(entry.paidAmount) * 100);
        const variance = paidCents - expectedCents;
        // Flag taxonomy (the four variance flags + matched):
        //   matched : paid == expected (no variance)
        //   missing : paid == 0 (no reimbursement landed at all)
        //   over    : paid > expected (over-payment)
        //   under   : 0 < paid < expected and paid < 50% of expected
        //             (substantial under-payment — needs adjustment)
        //   partial : 50% <= paid < expected (partial reimbursement —
        //             accepted but flagged for review)
        let flag: "matched" | "missing" | "partial" | "over" | "under";
        if (variance === 0) flag = "matched";
        else if (paidCents === 0) flag = "missing";
        else if (paidCents > expectedCents) flag = "over";
        else if (paidCents * 2 < expectedCents) flag = "under";
        else flag = "partial";
        if (flag === "matched") matchedReportIds.add(entry.reportId);
        await tx.insert(reconciliationRecordsTable).values({
          batchId: batch.id,
          reportId: entry.reportId,
          expectedAmount: item.amount,
          paidAmount: (paidCents / 100).toFixed(2),
          variance: ((variance) / 100).toFixed(2),
          flag,
          note: entry.note ?? null,
        });
      }
    });

    // Only matched reports advance to "Reconciled". Reports with a variance
    // remain in "Paid Through Payroll" so finance can review and adjust.
    for (const r of reports) {
      if (!matchedReportIds.has(r.id)) continue;
      const fresh = reportById.get(r.id) ?? r;
      await applyTransition({
        report: fresh,
        actor: { id: req.auth!.user.id, role: req.auth!.user.role },
        transition: "reconcile",
        metadata: JSON.stringify({ batchId: batch.id }),
      });
    }

    const [updated] = await db
      .update(payrollBatchesTable)
      .set({ status: "Reconciled", reconciledAt: new Date() })
      .where(eq(payrollBatchesTable.id, batch.id))
      .returning();
    res.json(GetPayrollBatchResponse.parse(await loadBatchDto(updated)));
  },
);

async function loadBatch(
  id: string,
  orgId: string,
): Promise<PayrollBatch | null> {
  const rows = await db
    .select()
    .from(payrollBatchesTable)
    .where(
      and(eq(payrollBatchesTable.id, id), eq(payrollBatchesTable.orgId, orgId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

function pathId(req: Request, key: string): string {
  const raw = (req.params as Record<string, string | string[]>)[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export default router;
