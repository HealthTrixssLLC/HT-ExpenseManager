import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  AdminCreateUserBody as CreateUserBody,
  AdminCreateDelegationBody as CreateDelegationBody,
  AdminGetQboConnectionResponse,
  AdminListGlMappingsResponse,
  AdminListUsersResponse,
  AdminUpdateGlMappingBody as UpdateGlMappingBody,
  AdminPatchPolicyRuleBody as PatchPolicyRuleBody,
  AdminUpdateUserBody as UpdateUserBody,
} from "@workspace/api-zod";
import {
  approvalActionsTable,
  db,
  departmentsTable,
  expenseReportsTable,
  glMappingsTable,
  managerDelegationsTable,
  policyRulesTable,
  usersTable,
} from "../lib/db";
import { hashPassword } from "../lib/auth";
import { sendProblem } from "../lib/problem";
import { requireAuth, requireRole } from "../middlewares/session";
import {
  toApprovalActionDto,
  toGlMappingDto,
  toPolicyRuleDto,
  toQboConnectionDto,
  toUserDto,
} from "../lib/serializers";
import {
  connectQboStub,
  disconnectQboStub,
  ensureConnectionRow,
} from "../services/qbo";

const router: IRouter = Router();

const ADMIN_ROLES = ["Accounting Admin", "System Admin"];
const SYSADMIN_ROLES = ["System Admin"];

router.use(requireAuth);

router.get(
  "/admin/users",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.orgId, orgId));
    const departments = await db
      .select()
      .from(departmentsTable)
      .where(eq(departmentsTable.orgId, orgId));
    const deptMap = new Map(departments.map((d) => [d.id, d] as const));
    const userMap = new Map(users.map((u) => [u.id, u] as const));
    const dtos = users.map((u) =>
      toUserDto(
        u,
        u.departmentId ? deptMap.get(u.departmentId) ?? null : null,
        u.managerId ? userMap.get(u.managerId) ?? null : null,
      ),
    );
    res.json(AdminListUsersResponse.parse(dtos));
  },
);

router.post(
  "/admin/users",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const orgId = req.auth!.user.orgId;
    const passwordHash = await hashPassword(parsed.data.password);
    const [user] = await db
      .insert(usersTable)
      .values({
        orgId,
        email: parsed.data.email.toLowerCase(),
        passwordHash,
        fullName: parsed.data.fullName,
        title: parsed.data.title ?? null,
        role: parsed.data.role,
        isAlsoEmployee: parsed.data.isAlsoEmployee ?? false,
        departmentId: parsed.data.departmentId ?? null,
        managerId: parsed.data.managerId ?? null,
      })
      .returning();
    const department = user.departmentId
      ? (
          await db
            .select()
            .from(departmentsTable)
            .where(eq(departmentsTable.id, user.departmentId))
            .limit(1)
        )[0] ?? null
      : null;
    const manager = user.managerId
      ? (
          await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, user.managerId))
            .limit(1)
        )[0] ?? null
      : null;
    res.status(201).json(toUserDto(user, department, manager));
  },
);

router.patch(
  "/admin/users/:id",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const parsed = UpdateUserBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const orgId = req.auth!.user.orgId;
    const existing = (
      await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, id), eq(usersTable.orgId, orgId)))
        .limit(1)
    )[0];
    if (!existing) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    const updates: Partial<typeof existing> = {};
    if (parsed.data.fullName !== undefined) updates.fullName = parsed.data.fullName;
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.role !== undefined) updates.role = parsed.data.role;
    if (parsed.data.isAlsoEmployee !== undefined)
      updates.isAlsoEmployee = parsed.data.isAlsoEmployee;
    if (parsed.data.departmentId !== undefined)
      updates.departmentId = parsed.data.departmentId;
    if (parsed.data.managerId !== undefined)
      updates.managerId = parsed.data.managerId;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
    if (parsed.data.password) updates.passwordHash = await hashPassword(parsed.data.password);

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, id))
      .returning();
    res.json(toUserDto(user, null, null));
  },
);

router.delete(
  "/admin/users/:id",
  requireRole(...SYSADMIN_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    if (id === req.auth!.user.id) {
      sendProblem(res, 409, "Conflict", "You cannot deactivate yourself.");
      return;
    }
    await db
      .update(usersTable)
      .set({ isActive: false })
      .where(
        and(eq(usersTable.id, id), eq(usersTable.orgId, req.auth!.user.orgId)),
      );
    res.status(204).end();
  },
);

router.get(
  "/admin/gl-mappings",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const rows = await db
      .select()
      .from(glMappingsTable)
      .where(eq(glMappingsTable.orgId, orgId));
    res.json(AdminListGlMappingsResponse.parse(rows.map(toGlMappingDto)));
  },
);

router.patch(
  "/admin/gl-mappings/:id",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const parsed = UpdateGlMappingBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const orgId = req.auth!.user.orgId;
    const updates: Partial<typeof glMappingsTable.$inferInsert> = {};
    if (parsed.data.qboAccount !== undefined) updates.qboAccount = parsed.data.qboAccount;
    if (parsed.data.qboAccountId !== undefined)
      updates.qboAccountId = parsed.data.qboAccountId;
    if (parsed.data.active !== undefined) updates.active = parsed.data.active;
    const [updated] = await db
      .update(glMappingsTable)
      .set(updates)
      .where(and(eq(glMappingsTable.id, id), eq(glMappingsTable.orgId, orgId)))
      .returning();
    if (!updated) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    res.json(toGlMappingDto(updated));
  },
);

// Admin policy-rules surface. The collection endpoint serves both shapes:
//   GET   /admin/policy-rules  → list every rule (including unset defaults
//                                via the lookups view if needed).
//   PATCH /admin/policy-rules  → upsert one rule by { name, value, description? }.
//                                We use PATCH because the collection's
//                                aggregate state is mutated; the patch body
//                                names the specific rule to upsert.
router.get(
  "/admin/policy-rules",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const rows = await db
      .select()
      .from(policyRulesTable)
      .where(eq(policyRulesTable.orgId, orgId));
    res.json(rows.map(toPolicyRuleDto));
  },
);

router.patch(
  "/admin/policy-rules",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const parsed = PatchPolicyRuleBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const orgId = req.auth!.user.orgId;
    const name = parsed.data.name;
    const existing = (
      await db
        .select()
        .from(policyRulesTable)
        .where(
          and(eq(policyRulesTable.orgId, orgId), eq(policyRulesTable.name, name)),
        )
        .limit(1)
    )[0];
    let row;
    if (existing) {
      [row] = await db
        .update(policyRulesTable)
        .set({
          value: parsed.data.value as object,
          description: parsed.data.description ?? existing.description,
        })
        .where(eq(policyRulesTable.id, existing.id))
        .returning();
    } else {
      [row] = await db
        .insert(policyRulesTable)
        .values({
          orgId,
          name,
          value: parsed.data.value as object,
          description: parsed.data.description ?? null,
        })
        .returning();
    }
    res.json(toPolicyRuleDto(row));
  },
);

// Canonical QuickBooks-stub admin endpoints. Connect/disconnect are POSTs (not
// a single PUT with an action discriminator) so each operation has a stable
// URL the UI can hit, and so the mocked OAuth dance reads like a real one.
router.get(
  "/admin/qbo-connection",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const conn = await ensureConnectionRow(orgId);
    res.json(AdminGetQboConnectionResponse.parse(toQboConnectionDto(conn)));
  },
);

router.post(
  "/admin/qbo-connection/connect-stub",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const conn = await connectQboStub(req.auth!.user.orgId);
    res.json(toQboConnectionDto(conn));
  },
);

router.post(
  "/admin/qbo-connection/disconnect",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const conn = await disconnectQboStub(req.auth!.user.orgId);
    res.json(toQboConnectionDto(conn));
  },
);

// Approval-action audit trail. Defaults to org-wide; pass ?reportId=<uuid> to
// scope to a single report (which is what the report detail page shows in the
// timeline tab).
router.get(
  "/admin/audit-log",
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const reportIdParam = (req.query["reportId"] as string | undefined) ?? null;
    const limitParam = Number(req.query["limit"] ?? "100");
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.trunc(limitParam), 1), 500)
      : 100;
    // approval_actions has no org column directly; join through expense_reports
    // to enforce org isolation (and to support the optional reportId filter).
    const where = reportIdParam
      ? and(
          eq(expenseReportsTable.orgId, orgId),
          eq(approvalActionsTable.reportId, reportIdParam),
        )
      : eq(expenseReportsTable.orgId, orgId);
    // Order by createdAt DESC (a wall-clock timestamp), not by `sequence` —
    // sequence is per-report and is meaningless across multiple reports.
    // Pushing ORDER BY + LIMIT into SQL avoids loading the full org history
    // into memory just to slice it.
    const rows = await db
      .select()
      .from(approvalActionsTable)
      .innerJoin(
        expenseReportsTable,
        eq(approvalActionsTable.reportId, expenseReportsTable.id),
      )
      .innerJoin(usersTable, eq(approvalActionsTable.actorId, usersTable.id))
      .where(where)
      .orderBy(desc(approvalActionsTable.createdAt))
      .limit(limit);
    res.json(
      rows.map((row) => toApprovalActionDto(row.approval_actions, row.users)),
    );
  },
);

// ---------------------------------------------------------------------------
// Manager delegations
//
// A delegation row says "manager FROM authorizes manager TO to act on their
// queue between startsAt and endsAt". The manager routes consult this table
// when honoring the `?delegateOf=` query param. Created/managed by System
// Admin so a single role owns the audit trail.
// ---------------------------------------------------------------------------

router.get(
  "/admin/delegations",
  requireRole(...SYSADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const activeOnly =
      String(req.query["activeOnly"] ?? "true").toLowerCase() !== "false";
    const rows = await db
      .select()
      .from(managerDelegationsTable)
      .where(eq(managerDelegationsTable.orgId, orgId))
      .orderBy(desc(managerDelegationsTable.createdAt));
    const userIds = new Set<string>();
    for (const row of rows) {
      userIds.add(row.fromManagerId);
      userIds.add(row.toManagerId);
    }
    const users = userIds.size
      ? await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.orgId, orgId))
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.fullName] as const));
    const now = new Date();
    const filtered = activeOnly
      ? rows.filter(
          (r) =>
            r.revokedAt === null &&
            r.startsAt <= now &&
            (r.endsAt === null || r.endsAt > now),
        )
      : rows;
    res.json(
      filtered.map((r) => ({
        id: r.id,
        fromManagerId: r.fromManagerId,
        fromManagerName: nameById.get(r.fromManagerId) ?? "Unknown",
        toManagerId: r.toManagerId,
        toManagerName: nameById.get(r.toManagerId) ?? "Unknown",
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt ? r.endsAt.toISOString() : null,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
        revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
      })),
    );
  },
);

router.post(
  "/admin/delegations",
  requireRole(...SYSADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const parsed = CreateDelegationBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const { fromManagerId, toManagerId, startsAt, endsAt, reason } = parsed.data;
    if (fromManagerId === toManagerId) {
      sendProblem(
        res,
        400,
        "Invalid Delegation",
        "fromManagerId and toManagerId must differ.",
      );
      return;
    }
    const userRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.orgId, orgId));
    const from = userRows.find((u) => u.id === fromManagerId);
    const to = userRows.find((u) => u.id === toManagerId);
    if (!from || !to) {
      sendProblem(res, 404, "Not Found", "from/to manager not in org.");
      return;
    }
    const okRoles = new Set(["Manager Approver", "System Admin"]);
    if (!okRoles.has(from.role) || !okRoles.has(to.role)) {
      sendProblem(
        res,
        400,
        "Invalid Delegation",
        "Both users must be Manager Approver or System Admin.",
      );
      return;
    }
    const [row] = await db
      .insert(managerDelegationsTable)
      .values({
        orgId,
        fromManagerId,
        toManagerId,
        startsAt: startsAt ? new Date(startsAt) : new Date(),
        endsAt: endsAt ? new Date(endsAt) : null,
        reason: reason ?? null,
        createdById: req.auth!.user.id,
      })
      .returning();
    res.status(201).json({
      id: row.id,
      fromManagerId: row.fromManagerId,
      fromManagerName: from.fullName,
      toManagerId: row.toManagerId,
      toManagerName: to.fullName,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
      revokedAt: null,
    });
  },
);

router.delete(
  "/admin/delegations/:id",
  requireRole(...SYSADMIN_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const orgId = req.auth!.user.orgId;
    const [existing] = await db
      .select()
      .from(managerDelegationsTable)
      .where(
        and(
          eq(managerDelegationsTable.id, id),
          eq(managerDelegationsTable.orgId, orgId),
        ),
      )
      .limit(1);
    if (!existing) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    await db
      .update(managerDelegationsTable)
      .set({ revokedAt: new Date() })
      .where(eq(managerDelegationsTable.id, id));
    res.status(204).end();
  },
);

// Suppress unused-import lint for or/isNull (kept for future SQL filters).
void or;
void isNull;

function pathId(req: Request, key: string): string {
  const raw = (req.params as Record<string, string | string[]>)[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export default router;
