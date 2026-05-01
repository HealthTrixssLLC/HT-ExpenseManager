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
  SetReportTagsBody,
  UpdateLineItemBody,
  UpdateReceiptBody,
  UpdateReportBody,
} from "@workspace/api-zod";
import { db, expenseReportsTable, lineItemsTable, receiptsTable, usersTable, approvalActionsTable, auditEntriesTable } from "../lib/db";
import { sendError, sendProblem } from "../lib/problem";
import { requireAuth } from "../middlewares/session";
import {
  canEditReport,
  canEditReportTags,
  canView,
  FINANCE_VISIBLE_STATUSES,
  fetchReportOrThrow,
  loadFullReport,
  loadReportSummaries,
  nextDisplayCode,
} from "../lib/reports";
import { ObjectStorageService } from "../lib/objectStorage";
import { verifyReceiptUpload } from "../lib/receipts";
import {
  toApprovalActionDto,
  toAuditEntryDto,
  toLineItemDto,
  toReceiptDto,
  toUserRef,
  type ChangeFeedItemDto,
} from "../lib/serializers";
import { applyTransition } from "../services/workflow";
import { listTags, listTagsForReport, setReportTags } from "../services/qbo";
import {
  diffFields,
  recordAudit,
  snapshotForCreate,
  snapshotForDelete,
} from "../services/audit";
import type { WorkflowStatus } from "@workspace/db";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Header fields tracked in the audit log. Excludes id, orgId, status, and
// timestamps (status changes flow through approval_actions instead).
const REPORT_AUDIT_FIELDS = [
  "title",
  "description",
  "departmentId",
  "policy",
  "periodStart",
  "periodEnd",
] as const;

const LINE_ITEM_AUDIT_FIELDS = [
  "occurredOn",
  "merchant",
  "description",
  "category",
  "amount",
  "paymentMethod",
] as const;

export const RECEIPT_AUDIT_FIELDS = [
  "lineItemId",
  "filename",
  "objectPath",
] as const;

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
      !auth.user.roles.some((r) =>
        ["Manager Approver", "Accounting Admin", "System Admin"].includes(r),
      )
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
      !auth.user.roles.some((r) =>
        ["Finance Approver", "Accounting Admin", "System Admin"].includes(r),
      )
    ) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    // Finance Approvers can ONLY see reports that have at least cleared
    // manager approval. Admins/Accounting can see everything in the org;
    // they should use scope=all if they want truly everything, but when
    // they explicitly ask for the finance queue we still constrain to the
    // finance-relevant statuses to mirror what the finance UI shows.
    where = and(
      where,
      inArray(
        expenseReportsTable.status,
        FINANCE_VISIBLE_STATUSES as WorkflowStatus[],
      ),
    );
  } else if (scope === "payroll") {
    if (
      !auth.user.roles.some((r) =>
        ["Finance Approver", "Accounting Admin", "System Admin"].includes(r),
      )
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
    if (
      !auth.user.roles.some((r) =>
        ["System Admin", "Accounting Admin"].includes(r),
      )
    ) {
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

// QBO tags applied to this report. Anyone who can see the report can read
// the tags; updating them requires edit rights (same gate as PATCH /reports/:id).
// Non-admin tag catalog. Used by the Report Tag Picker (employee + finance
// views) so non-admins don't have to call the admin-only listing endpoint.
// Returns the same shape as the admin endpoint, filtered to active tags only
// — admins manage the inactive ones via the Tags admin page.
router.get("/qbo-tags", async (req, res): Promise<void> => {
  try {
    const orgId = req.auth!.user.orgId;
    const rows = await listTags(orgId);
    res.json(
      rows
        .filter((r) => r.active)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          active: r.active,
        })),
    );
  } catch (err) {
    handle(res, err);
  }
});

router.get("/reports/:id/tags", async (req, res): Promise<void> => {
  try {
    const id = pathId(req, "id");
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    if (!(await canView(report, req.auth!.user))) {
      sendProblem(res, 403, "Forbidden");
      return;
    }
    const tags = await listTagsForReport(report.id);
    res.json(tags);
  } catch (err) {
    handle(res, err);
  }
});

router.put("/reports/:id/tags", async (req, res): Promise<void> => {
  try {
    const id = pathId(req, "id");
    const parsed = SetReportTagsBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    const auth = await canEditReportTags(report, req.auth!.user);
    if (!auth.ok) {
      sendProblem(res, auth.status, auth.title, auth.detail);
      return;
    }
    try {
      await setReportTags({
        orgId: report.orgId,
        reportId: report.id,
        tagIds: parsed.data.tagIds,
      });
    } catch (err) {
      sendProblem(
        res,
        400,
        "Invalid Tags",
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
    const tags = await listTagsForReport(report.id);
    res.json(tags);
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
    const auth = await canEditReport(report, req.auth!.user);
    if (!auth.ok) {
      sendProblem(res, auth.status, auth.title, auth.detail);
      return;
    }
    const data = parsed.data;
    const nextValues = {
      title: data.title ?? report.title,
      description: data.description ?? report.description,
      departmentId:
        data.departmentId === undefined ? report.departmentId : data.departmentId,
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
    };
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(expenseReportsTable)
        .set(nextValues)
        .where(eq(expenseReportsTable.id, report.id))
        .returning();
      const diffs = diffFields(
        report as unknown as Record<string, unknown>,
        row as unknown as Record<string, unknown>,
        REPORT_AUDIT_FIELDS,
      );
      await recordAudit({
        orgId: report.orgId,
        reportId: report.id,
        actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
        entityType: "report",
        entityId: report.id,
        action: "updated",
        fieldDiffs: diffs,
        tx,
      });
      return row;
    });
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
      actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
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
      actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
      transition: "withdraw",
      allowSelf: true,
      comment: typeof req.body?.comment === "string" ? req.body.comment : null,
    });
    res.json(ExpenseReportResponse.parse(await loadFullReport(result.report)));
  } catch (err) {
    handle(res, err);
  }
});

router.post("/reports/:id/void", async (req, res): Promise<void> => {
  try {
    const id = pathId(req, "id");
    const report = await fetchReportOrThrow(id, req.auth!.user.orgId);
    // Owner can void editable statuses; admins handle everything else.
    // applyTransition's per-status actor whitelist enforces the matrix.
    const result = await applyTransition({
      report,
      actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
      transition: "voidReport",
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
    const [actions, audits] = await Promise.all([
      db
        .select()
        .from(approvalActionsTable)
        .where(eq(approvalActionsTable.reportId, report.id))
        .orderBy(asc(approvalActionsTable.sequence)),
      db
        .select()
        .from(auditEntriesTable)
        .where(eq(auditEntriesTable.reportId, report.id))
        .orderBy(asc(auditEntriesTable.createdAt)),
    ]);
    const actorIds = [
      ...new Set([
        ...actions.map((a) => a.actorId),
        ...audits.map((a) => a.actorId),
      ]),
    ];
    const actors = actorIds.length
      ? await db.select().from(usersTable).where(inArray(usersTable.id, actorIds))
      : [];
    const actorById = new Map(actors.map((u) => [u.id, u]));
    const items: ChangeFeedItemDto[] = [
      ...actions.map((a) => ({
        kind: "approval" as const,
        createdAt: a.createdAt.toISOString(),
        approval: toApprovalActionDto(
          a,
          actorById.get(a.actorId) ?? {
            id: a.actorId,
            fullName: "Unknown",
            roles: a.actorRoles,
          } as Parameters<typeof toApprovalActionDto>[1],
        ),
        content: null,
      })),
      ...audits.map((entry) => {
        const actor = actorById.get(entry.actorId);
        const ref = actor
          ? toUserRef(actor)
          : { id: entry.actorId, fullName: "Unknown", roles: entry.actorRoles };
        return {
          kind: "content" as const,
          createdAt: entry.createdAt.toISOString(),
          approval: null,
          content: toAuditEntryDto(entry, ref),
        };
      }),
    ];
    items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    res.json(GetReportTimelineResponse.parse(items));
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
    const auth = await canEditReport(report, req.auth!.user);
    if (!auth.ok) {
      sendProblem(res, auth.status, auth.title, auth.detail);
      return;
    }
    const line = await db.transaction(async (tx) => {
      const [row] = await tx
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
      await recordAudit({
        orgId: report.orgId,
        reportId: report.id,
        actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
        entityType: "line_item",
        entityId: row.id,
        action: "created",
        fieldDiffs: snapshotForCreate(
          row as unknown as Record<string, unknown>,
          LINE_ITEM_AUDIT_FIELDS,
        ),
        tx,
      });
      return row;
    });
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
    const auth = await canEditReport(report, req.auth!.user);
    if (!auth.ok) {
      sendProblem(res, auth.status, auth.title, auth.detail);
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
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
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
      await recordAudit({
        orgId: report.orgId,
        reportId: report.id,
        actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
        entityType: "line_item",
        entityId: row.id,
        action: "updated",
        fieldDiffs: diffFields(
          existing as unknown as Record<string, unknown>,
          row as unknown as Record<string, unknown>,
          LINE_ITEM_AUDIT_FIELDS,
        ),
        tx,
      });
      return row;
    });
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
    const auth = await canEditReport(report, req.auth!.user);
    if (!auth.ok) {
      sendProblem(res, auth.status, auth.title, auth.detail);
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
    await db.transaction(async (tx) => {
      // Capture the snapshot BEFORE delete so the audit row is meaningful
      // after the entity is gone.
      await recordAudit({
        orgId: report.orgId,
        reportId: report.id,
        actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
        entityType: "line_item",
        entityId: existing.id,
        action: "deleted",
        fieldDiffs: snapshotForDelete(
          existing as unknown as Record<string, unknown>,
          LINE_ITEM_AUDIT_FIELDS,
        ),
        tx,
      });
      await tx
        .delete(lineItemsTable)
        .where(
          and(
            eq(lineItemsTable.id, lineId),
            eq(lineItemsTable.reportId, report.id),
          ),
        );
    });
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
    const auth = await canEditReport(report, req.auth!.user);
    if (!auth.ok) {
      sendProblem(res, auth.status, auth.title, auth.detail);
      return;
    }
    // Authoritative server-side check: re-derive size + content type from the
    // actual object the client uploaded, and verify the canonical key embeds
    // *this* org and report. We persist the storage-reported values, never
    // the client-claimed ones.
    const verified = await verifyReceiptUpload({
      objectStorage: objectStorageService,
      objectPath: parsed.data.objectPath,
      expectedOrgId: req.auth!.user.orgId,
      expectedReportId: report.id,
    });
    if (!verified.ok) {
      sendProblem(res, verified.status, verified.title, verified.detail);
      return;
    }
    const receipt = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(receiptsTable)
        .values({
          orgId: req.auth!.user.orgId,
          reportId: report.id,
          lineItemId: lineId,
          objectPath: parsed.data.objectPath,
          filename: parsed.data.filename,
          mimeType: verified.contentType,
          sizeBytes: verified.sizeBytes,
          uploadedById: req.auth!.user.id,
        })
        .returning();
      await recordAudit({
        orgId: report.orgId,
        reportId: report.id,
        actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
        entityType: "receipt",
        entityId: row.id,
        action: "created",
        fieldDiffs: snapshotForCreate(
          row as unknown as Record<string, unknown>,
          RECEIPT_AUDIT_FIELDS,
        ),
        tx,
      });
      return row;
    });
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
    const auth = await canEditReport(report, req.auth!.user);
    if (!auth.ok) {
      sendProblem(res, auth.status, auth.title, auth.detail);
      return;
    }
    // If a lineItemId is supplied, the line MUST belong to this report and
    // org — otherwise we'd let a caller cross-reference a receipt to a line
    // on someone else's report. Validate before touching object storage.
    if (parsed.data.lineItemId) {
      const [line] = await db
        .select()
        .from(lineItemsTable)
        .where(eq(lineItemsTable.id, parsed.data.lineItemId))
        .limit(1);
      if (!line || line.reportId !== report.id) {
        sendProblem(
          res,
          400,
          "Invalid Line Item",
          "lineItemId does not belong to this report.",
        );
        return;
      }
    }
    const verified = await verifyReceiptUpload({
      objectStorage: objectStorageService,
      objectPath: parsed.data.objectPath,
      expectedOrgId: req.auth!.user.orgId,
      expectedReportId: report.id,
    });
    if (!verified.ok) {
      sendProblem(res, verified.status, verified.title, verified.detail);
      return;
    }
    const receipt = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(receiptsTable)
        .values({
          orgId: req.auth!.user.orgId,
          reportId: report.id,
          lineItemId: parsed.data.lineItemId ?? null,
          objectPath: parsed.data.objectPath,
          filename: parsed.data.filename,
          mimeType: verified.contentType,
          sizeBytes: verified.sizeBytes,
          uploadedById: req.auth!.user.id,
        })
        .returning();
      await recordAudit({
        orgId: report.orgId,
        reportId: report.id,
        actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
        entityType: "receipt",
        entityId: row.id,
        action: "created",
        fieldDiffs: snapshotForCreate(
          row as unknown as Record<string, unknown>,
          RECEIPT_AUDIT_FIELDS,
        ),
        tx,
      });
      return row;
    });
    res.status(201).json(toReceiptDto(receipt));
  } catch (err) {
    handle(res, err);
  }
});

// PATCH /receipts/:id — update mutable receipt metadata. Today only the
// `lineItemId` is mutable: pass a line ID on the same report to attach an
// existing receipt to a specific line, or `null` to detach. Authorization
// is delegated to the parent report's edit gate (canEditReport): owner OR
// direct manager OR active delegate, only while the report is in a
// content-editable status (anything before Finance Approved).
router.patch("/receipts/:id", async (req, res): Promise<void> => {
  try {
    const id = pathId(req, "id");
    const parsed = UpdateReceiptBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const [receipt] = await db
      .select()
      .from(receiptsTable)
      .where(
        and(
          eq(receiptsTable.id, id),
          eq(receiptsTable.orgId, req.auth!.user.orgId),
        ),
      )
      .limit(1);
    if (!receipt) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    if (!receipt.reportId) {
      sendProblem(
        res,
        400,
        "Invalid Receipt",
        "Receipt is not associated with a report.",
      );
      return;
    }
    const report = await fetchReportOrThrow(
      receipt.reportId,
      req.auth!.user.orgId,
    );
    const authResult = await canEditReport(report, req.auth!.user);
    if (!authResult.ok) {
      sendProblem(res, authResult.status, authResult.title, authResult.detail);
      return;
    }
    if (parsed.data.lineItemId) {
      const [line] = await db
        .select()
        .from(lineItemsTable)
        .where(eq(lineItemsTable.id, parsed.data.lineItemId))
        .limit(1);
      if (!line || line.reportId !== report.id) {
        sendProblem(
          res,
          400,
          "Invalid Line Item",
          "lineItemId does not belong to this report.",
        );
        return;
      }
    }
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(receiptsTable)
        .set({ lineItemId: parsed.data.lineItemId ?? null })
        .where(eq(receiptsTable.id, id))
        .returning();
      await recordAudit({
        orgId: report.orgId,
        reportId: report.id,
        actor: { id: req.auth!.user.id, roles: req.auth!.user.roles },
        entityType: "receipt",
        entityId: row.id,
        action: "updated",
        fieldDiffs: diffFields(
          receipt as unknown as Record<string, unknown>,
          row as unknown as Record<string, unknown>,
          RECEIPT_AUDIT_FIELDS,
        ),
        tx,
      });
      return row;
    });
    res.status(200).json(toReceiptDto(updated));
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
