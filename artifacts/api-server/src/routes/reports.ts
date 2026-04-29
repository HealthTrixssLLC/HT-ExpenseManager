import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import {
  CreateLineItemBody,
  CreateReportBody,
  GetReportResponse as ExpenseReportResponse,
  GetReportTimelineResponse,
  ListLineItemsResponseItem as LineItemSchema,
  ListLineItemsResponse,
  ListReceiptsResponse,
  ListReportsResponse,
  RegisterReceiptBody,
  UpdateLineItemBody,
  UpdateReportBody,
} from "@workspace/api-zod";
import { db, expenseReportsTable, lineItemsTable, receiptsTable, usersTable, approvalActionsTable } from "../lib/db";
import { sendError, sendProblem } from "../lib/problem";
import { requireAuth } from "../middlewares/session";
import {
  canView,
  fetchReportOrThrow,
  loadFullReport,
  loadReportSummaries,
  nextDisplayCode,
} from "../lib/reports";
import {
  toApprovalActionDto,
  toLineItemDto,
  toReceiptDto,
} from "../lib/serializers";
import { applyTransition } from "../services/workflow";
import type { WorkflowStatus } from "@workspace/db";

const router: IRouter = Router();

const EDITABLE_STATUSES: WorkflowStatus[] = ["Draft", "Changes Requested"];

router.use(requireAuth);

router.get("/reports", async (req: Request, res: Response): Promise<void> => {
  const auth = req.auth!;
  const orgId = auth.user.orgId;
  const ALLOWED_SCOPES = ["mine", "manager", "finance", "payroll", "all"] as const;
  type Scope = typeof ALLOWED_SCOPES[number];
  // The spec exposes `?mine=true` as a shorthand for `?scope=mine`. Either
  // works; `?mine=true` wins if both are present.
  const mineFlag = String(req.query["mine"] ?? "").toLowerCase() === "true";
  const rawScope = mineFlag
    ? "mine"
    : (req.query["scope"] as string | undefined) ?? "mine";
  if (!ALLOWED_SCOPES.includes(rawScope as Scope)) {
    sendProblem(res, 400, "Bad Request", `Unknown scope: ${rawScope}`);
    return;
  }
  const scope: Scope = rawScope as Scope;
  const statusFilter = (req.query["status"] as string | undefined)?.split(",");

  let where = and(eq(expenseReportsTable.orgId, orgId));
  if (scope === "mine") {
    where = and(where, eq(expenseReportsTable.employeeId, auth.user.id));
  } else if (scope === "manager") {
    if (
      auth.user.role !== "Manager Approver" &&
      auth.user.role !== "Accounting Admin" &&
      auth.user.role !== "System Admin"
    ) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    const reportEmployees = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.managerId, auth.user.id));
    const ids = reportEmployees.map((r) => r.id);
    if (ids.length === 0) {
      res.json([]);
      return;
    }
    where = and(where, inArray(expenseReportsTable.employeeId, ids));
  } else if (scope === "finance") {
    if (
      auth.user.role !== "Finance Approver" &&
      auth.user.role !== "Accounting Admin" &&
      auth.user.role !== "System Admin"
    ) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
  } else if (scope === "payroll") {
    if (
      auth.user.role !== "Finance Approver" &&
      auth.user.role !== "Accounting Admin" &&
      auth.user.role !== "System Admin"
    ) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    where = and(
      where,
      or(
        eq(expenseReportsTable.status, "Ready for Payroll Reimbursement"),
        eq(expenseReportsTable.status, "Paid Through Payroll"),
        eq(expenseReportsTable.status, "Reconciled"),
      ),
    );
  } else {
    // scope === "all"
    if (auth.user.role !== "System Admin" && auth.user.role !== "Accounting Admin") {
      sendProblem(res, 403, "Forbidden");
      return;
    }
  }

  if (statusFilter && statusFilter.length > 0) {
    where = and(
      where,
      inArray(
        expenseReportsTable.status,
        statusFilter as WorkflowStatus[],
      ),
    );
  }

  const rows = await db
    .select()
    .from(expenseReportsTable)
    .where(where)
    .orderBy(desc(expenseReportsTable.createdAt));

  const summaries = await loadReportSummaries(rows);
  res.json(ListReportsResponse.parse(summaries));
});

router.post("/reports", async (req, res): Promise<void> => {
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) {
    sendProblem(res, 400, "Invalid Body", parsed.error.message);
    return;
  }
  const auth = req.auth!;
  const orgId = auth.user.orgId;
  const displayCode = await nextDisplayCode(orgId);
  const [report] = await db
    .insert(expenseReportsTable)
    .values({
      orgId,
      displayCode,
      employeeId: auth.user.id,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      departmentId:
        parsed.data.departmentId ?? auth.user.departmentId ?? null,
      policy: parsed.data.policy ?? "Standard Travel",
      periodStart: parsed.data.periodStart
        ? toIsoDate(parsed.data.periodStart)
        : null,
      periodEnd: parsed.data.periodEnd
        ? toIsoDate(parsed.data.periodEnd)
        : null,
    })
    .returning();
  const dto = await loadFullReport(report);
  res.status(201).json(ExpenseReportResponse.parse(dto));
});

router.get("/reports/:id", async (req, res): Promise<void> => {
  try {
    const id = pathId(req, "id");
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    if (!(await canView(report, req.auth!.user))) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    res.json(ExpenseReportResponse.parse(await loadFullReport(report)));
  } catch (err) {
    handle(res, err);
  }
});

router.patch("/reports/:id", async (req, res): Promise<void> => {
  try {
    const id = pathId(req, "id");
    const parsed = UpdateReportBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    if (req.auth!.user.id !== report.employeeId) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    if (!EDITABLE_STATUSES.includes(report.status)) {
      sendProblem(
        res,
        409,
        "Locked",
        `Cannot edit a report in status "${report.status}".`,
      );
      return;
    }
    const data = parsed.data;
    const [updated] = await db
      .update(expenseReportsTable)
      .set({
        title: data.title ?? report.title,
        description: data.description ?? report.description,
        departmentId:
          data.departmentId === undefined
            ? report.departmentId
            : data.departmentId,
        policy: data.policy ?? report.policy,
        periodStart:
          data.periodStart === undefined
            ? report.periodStart
            : data.periodStart
              ? toIsoDate(data.periodStart)
              : null,
        periodEnd:
          data.periodEnd === undefined
            ? report.periodEnd
            : data.periodEnd
              ? toIsoDate(data.periodEnd)
              : null,
      })
      .where(eq(expenseReportsTable.id, report.id))
      .returning();
    res.json(ExpenseReportResponse.parse(await loadFullReport(updated)));
  } catch (err) {
    handle(res, err);
  }
});

router.delete("/reports/:id", async (req, res): Promise<void> => {
  try {
    const id = pathId(req, "id");
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    if (req.auth!.user.id !== report.employeeId) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    if (report.status !== "Draft") {
      sendProblem(
        res,
        409,
        "Locked",
        "Only Draft reports can be deleted; submitted reports must be voided.",
      );
      return;
    }
    await db
      .delete(expenseReportsTable)
      .where(eq(expenseReportsTable.id, report.id));
    res.status(204).end();
  } catch (err) {
    handle(res, err);
  }
});

router.post("/reports/:id/submit", async (req, res): Promise<void> => {
  try {
    const id = pathId(req, "id");
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    const result = await applyTransition({
      report,
      actor: { id: req.auth!.user.id, role: req.auth!.user.role },
      transition: "submit",
      allowSelf: true,
      comment: typeof req.body?.comment === "string" ? req.body.comment : null,
    });
    res.json(ExpenseReportResponse.parse(await loadFullReport(result.report)));
  } catch (err) {
    handle(res, err);
  }
});

router.post("/reports/:id/recall", async (req, res): Promise<void> => {
  try {
    const id = pathId(req, "id");
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    const result = await applyTransition({
      report,
      actor: { id: req.auth!.user.id, role: req.auth!.user.role },
      transition: "withdraw",
      allowSelf: true,
      comment: typeof req.body?.comment === "string" ? req.body.comment : null,
    });
    res.json(ExpenseReportResponse.parse(await loadFullReport(result.report)));
  } catch (err) {
    handle(res, err);
  }
});

router.get("/reports/:id/timeline", async (req, res): Promise<void> => {
  try {
    const id = pathId(req, "id");
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    if (!(await canView(report, req.auth!.user))) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    const actions = await db
      .select()
      .from(approvalActionsTable)
      .where(eq(approvalActionsTable.reportId, report.id))
      .orderBy(asc(approvalActionsTable.sequence));
    const actorIds = [...new Set(actions.map((a) => a.actorId))];
    const actors = actorIds.length
      ? await db.select().from(usersTable).where(inArray(usersTable.id, actorIds))
      : [];
    const actorById = new Map(actors.map((u) => [u.id, u]));
    res.json(
      GetReportTimelineResponse.parse(
        actions.map((a) =>
          toApprovalActionDto(
            a,
            actorById.get(a.actorId) ?? {
              id: a.actorId,
              fullName: "Unknown",
              role: a.actorRole,
            } as Parameters<typeof toApprovalActionDto>[1],
          ),
        ),
      ),
    );
  } catch (err) {
    handle(res, err);
  }
});

router.get("/reports/:id/lines", async (req, res): Promise<void> => {
  try {
    const id = pathId(req, "id");
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    if (!(await canView(report, req.auth!.user))) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    const lines = await db
      .select()
      .from(lineItemsTable)
      .where(eq(lineItemsTable.reportId, report.id))
      .orderBy(asc(lineItemsTable.occurredOn));
    const receipts = await db
      .select()
      .from(receiptsTable)
      .where(eq(receiptsTable.reportId, report.id));
    const counts = new Map<string, number>();
    for (const r of receipts) {
      if (!r.lineItemId) continue;
      counts.set(r.lineItemId, (counts.get(r.lineItemId) ?? 0) + 1);
    }
    res.json(
      ListLineItemsResponse.parse(
        lines.map((l) => toLineItemDto(l, counts.get(l.id) ?? 0)),
      ),
    );
  } catch (err) {
    handle(res, err);
  }
});

router.post("/reports/:id/lines", async (req, res): Promise<void> => {
  try {
    const id = pathId(req, "id");
    const parsed = CreateLineItemBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    if (req.auth!.user.id !== report.employeeId) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    if (!EDITABLE_STATUSES.includes(report.status)) {
      sendProblem(res, 409, "Locked", "Report is not editable.");
      return;
    }
    const [line] = await db
      .insert(lineItemsTable)
      .values({
        reportId: report.id,
        occurredOn: toIsoDate(parsed.data.occurredOn),
        merchant: parsed.data.merchant,
        description: parsed.data.description ?? "",
        category: parsed.data.category,
        amount: normalizeAmount(parsed.data.amount),
        paymentMethod: parsed.data.paymentMethod,
      })
      .returning();
    res.status(201).json(LineItemSchema.parse(toLineItemDto(line, 0)));
  } catch (err) {
    handle(res, err);
  }
});

router.patch("/lines/:lineId", async (req, res): Promise<void> => {
  const lineId = pathId(req, "lineId");
  // Resolve the parent report from the line itself so the route is top-level.
  const lineRow = (
    await db
      .select({ reportId: lineItemsTable.reportId })
      .from(lineItemsTable)
      .where(eq(lineItemsTable.id, lineId))
      .limit(1)
  )[0];
  if (!lineRow) {
    sendProblem(res, 404, "Not Found");
    return;
  }
  (req.params as Record<string, string>)["id"] = lineRow.reportId;
  return updateLineItemHandler(req, res);
});

async function updateLineItemHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = pathId(req, "id");
    const lineId = pathId(req, "lineId");
    const parsed = UpdateLineItemBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    if (req.auth!.user.id !== report.employeeId) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    if (!EDITABLE_STATUSES.includes(report.status)) {
      sendProblem(res, 409, "Locked", "Report is not editable.");
      return;
    }
    const existing = (
      await db
        .select()
        .from(lineItemsTable)
        .where(
          and(eq(lineItemsTable.id, lineId), eq(lineItemsTable.reportId, report.id)),
        )
        .limit(1)
    )[0];
    if (!existing) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    const [updated] = await db
      .update(lineItemsTable)
      .set({
        occurredOn: parsed.data.occurredOn
          ? toIsoDate(parsed.data.occurredOn)
          : existing.occurredOn,
        merchant: parsed.data.merchant ?? existing.merchant,
        description: parsed.data.description ?? existing.description,
        category: parsed.data.category ?? existing.category,
        amount: parsed.data.amount
          ? normalizeAmount(parsed.data.amount)
          : existing.amount,
        paymentMethod: parsed.data.paymentMethod ?? existing.paymentMethod,
      })
      .where(eq(lineItemsTable.id, lineId))
      .returning();
    res.json(LineItemSchema.parse(toLineItemDto(updated, 0)));
  } catch (err) {
    handle(res, err);
  }
}

router.delete("/lines/:lineId", async (req, res): Promise<void> => {
  const lineId = pathId(req, "lineId");
  const lineRow = (
    await db
      .select({ reportId: lineItemsTable.reportId })
      .from(lineItemsTable)
      .where(eq(lineItemsTable.id, lineId))
      .limit(1)
  )[0];
  if (!lineRow) {
    sendProblem(res, 404, "Not Found");
    return;
  }
  (req.params as Record<string, string>)["id"] = lineRow.reportId;
  return deleteLineItemHandler(req, res);
});

async function deleteLineItemHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = pathId(req, "id");
    const lineId = pathId(req, "lineId");
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    if (req.auth!.user.id !== report.employeeId) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    if (!EDITABLE_STATUSES.includes(report.status)) {
      sendProblem(res, 409, "Locked", "Report is not editable.");
      return;
    }
    await db
      .delete(lineItemsTable)
      .where(
        and(eq(lineItemsTable.id, lineId), eq(lineItemsTable.reportId, report.id)),
      );
    res.status(204).end();
  } catch (err) {
    handle(res, err);
  }
}

router.get("/reports/:id/receipts", async (req, res): Promise<void> => {
  try {
    const id = pathId(req, "id");
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    if (!(await canView(report, req.auth!.user))) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    const rows = await db
      .select()
      .from(receiptsTable)
      .where(eq(receiptsTable.reportId, report.id));
    res.json(ListReceiptsResponse.parse(rows.map(toReceiptDto)));
  } catch (err) {
    handle(res, err);
  }
});

// Attach an already-uploaded object to a specific line item. The line's
// parent report drives ownership and editability checks.
router.post("/lines/:lineId/receipts", async (req, res): Promise<void> => {
  try {
    const lineId = pathId(req, "lineId");
    const parsed = RegisterReceiptBody.safeParse({
      ...(req.body ?? {}),
      lineItemId: lineId,
    });
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const lineRow = (
      await db
        .select()
        .from(lineItemsTable)
        .where(eq(lineItemsTable.id, lineId))
        .limit(1)
    )[0];
    if (!lineRow) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    const report = await fetchReportOrThrow(
      lineRow.reportId,
      req.auth!.user.orgId,
    );
    if (req.auth!.user.id !== report.employeeId) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    const [receipt] = await db
      .insert(receiptsTable)
      .values({
        orgId: req.auth!.user.orgId,
        reportId: report.id,
        lineItemId: lineId,
        objectPath: parsed.data.objectPath,
        filename: parsed.data.filename,
        mimeType: parsed.data.mimeType,
        sizeBytes: parsed.data.sizeBytes,
        uploadedById: req.auth!.user.id,
      })
      .returning();
    res.status(201).json(toReceiptDto(receipt));
  } catch (err) {
    handle(res, err);
  }
});

router.post("/reports/:id/receipts", async (req, res): Promise<void> => {
  try {
    const id = pathId(req, "id");
    const parsed = RegisterReceiptBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    if (req.auth!.user.id !== report.employeeId) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    const [receipt] = await db
      .insert(receiptsTable)
      .values({
        orgId: req.auth!.user.orgId,
        reportId: report.id,
        lineItemId: parsed.data.lineItemId ?? null,
        objectPath: parsed.data.objectPath,
        filename: parsed.data.filename,
        mimeType: parsed.data.mimeType,
        sizeBytes: parsed.data.sizeBytes,
        uploadedById: req.auth!.user.id,
      })
      .returning();
    res.status(201).json(toReceiptDto(receipt));
  } catch (err) {
    handle(res, err);
  }
});

function pathId(req: Request, key: string): string {
  const raw = (req.params as Record<string, string | string[]>)[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function toIsoDate(input: unknown): string {
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  if (typeof input === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  throw new Error(`Invalid date: ${String(input)}`);
}

function normalizeAmount(input: string): string {
  const num = parseFloat(input);
  if (Number.isNaN(num)) throw new Error(`Invalid amount: ${input}`);
  return num.toFixed(2);
}

function handle(res: Response, err: unknown): void {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status ?? 500;
    const message =
      err instanceof Error ? err.message : String((err as { message?: unknown }).message ?? "");
    sendProblem(res, status, status === 404 ? "Not Found" : "Error", message);
    return;
  }
  sendError(res, err);
}

export default router;
