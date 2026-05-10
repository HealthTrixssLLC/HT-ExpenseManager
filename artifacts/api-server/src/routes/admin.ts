import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import {
  AdminCreateDepartmentBody,
  AdminCreateUserBody as CreateUserBody,
  AdminCreateDelegationBody as CreateDelegationBody,
  AdminCreateQboTagBody as CreateQboTagBody,
  AdminGetQboConnectionResponse,
  AdminListGlMappingsResponse,
  AdminListUsersResponse,
  AdminRenameDepartmentBody,
  AdminSaveQboCredentialsBody as SaveQboCredentialsBody,
  AdminSaveQboPostingPreferencesBody as SaveQboPostingPreferencesBody,
  AdminUpdateGlMappingBody as UpdateGlMappingBody,
  AdminUpdateQboTagBody as UpdateQboTagBody,
  AdminPatchPolicyRuleBody as PatchPolicyRuleBody,
  AdminUpdateUserBody as UpdateUserBody,
} from "@workspace/api-zod";
import {
  approvalActionsTable,
  auditEntriesTable,
  db,
  departmentsTable,
  expenseReportsTable,
  glMappingsTable,
  managerDelegationsTable,
  policyRulesTable,
  usersTable,
} from "../lib/db";
import { hashPassword } from "../lib/auth";
import { assertSameOrgRefs } from "../lib/orgRefs";
import { sendProblem } from "../lib/problem";
import { requireAuth, requireRole } from "../middlewares/session";
import {
  toApprovalActionDto,
  toAuditEntryDto,
  toGlMappingDto,
  toPolicyRuleDto,
  toQboConnectionDto,
  toUserDto,
  toUserRef,
  type ChangeFeedItemDto,
} from "../lib/serializers";
import {
  connectQboStub,
  createTag,
  deleteTag,
  disconnectQboReal,
  disconnectQboStub,
  ensureConnectionRow,
  getConnectionHealth,
  hasRealCredentials,
  listChartOfAccounts,
  listPostingHistory,
  listTags,
  recordQboAudit,
  refreshOrgTokensIfNeeded,
  runQboPreflight,
  savePostingPreferences,
  saveQboCredentials,
  startQboOauth,
  updateTag,
} from "../services/qbo";
import {
  QboRedirectConfigError,
  resolveQboRedirectUri,
} from "../services/qboRedirect";
import multer from "multer";
import {
  applyRestore,
  exportBackup,
  BackupOrgMismatchError,
  BackupParseError,
  BackupVersionError,
  CURRENT_BACKUP_SCHEMA_VERSION,
} from "../services/backup";
import {
  applySystemReset,
  exportFullSystemBackup,
} from "../services/systemReset";

// App version surfaced in backup manifests. Sourced from the API server
// package so a single bump there propagates everywhere we report a version.
const APP_VERSION = "0.1.0";

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
    const refError = await assertSameOrgRefs(orgId, {
      departmentId: parsed.data.departmentId ?? null,
      managerId: parsed.data.managerId ?? null,
    });
    if (refError) {
      sendProblem(res, 400, "Invalid Reference", refError);
      return;
    }
    const passwordHash = await hashPassword(parsed.data.password);
    const [user] = await db
      .insert(usersTable)
      .values({
        orgId,
        email: parsed.data.email.toLowerCase(),
        passwordHash,
        fullName: parsed.data.fullName,
        title: parsed.data.title ?? null,
        roles: Array.from(new Set(parsed.data.roles)),
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
    const refError = await assertSameOrgRefs(orgId, {
      departmentId:
        parsed.data.departmentId !== undefined ? parsed.data.departmentId : undefined,
      managerId:
        parsed.data.managerId !== undefined ? parsed.data.managerId : undefined,
    });
    if (refError) {
      sendProblem(res, 400, "Invalid Reference", refError);
      return;
    }
    const updates: Partial<typeof existing> = {};
    if (parsed.data.fullName !== undefined) updates.fullName = parsed.data.fullName;
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.roles !== undefined)
      updates.roles = Array.from(new Set(parsed.data.roles));
    if (parsed.data.isAlsoEmployee !== undefined)
      updates.isAlsoEmployee = parsed.data.isAlsoEmployee;
    if (parsed.data.departmentId !== undefined)
      updates.departmentId = parsed.data.departmentId;
    if (parsed.data.managerId !== undefined)
      updates.managerId = parsed.data.managerId;
    if (parsed.data.isActive !== undefined) {
      // The DELETE endpoint already prevents self-deactivation; we mirror
      // the rule here so the new "Activate / Deactivate" toggle exposed on
      // the admin Users page cannot be used to lock yourself out either.
      if (parsed.data.isActive === false && id === req.auth!.user.id) {
        sendProblem(res, 409, "Conflict", "You cannot deactivate yourself.");
        return;
      }
      updates.isActive = parsed.data.isActive;
    }
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

// Department management. The /lookups/departments read endpoint is the
// general-purpose picker source; these admin routes are scoped to admins
// and surface usage counts so the UI can guard delete.
router.get(
  "/admin/departments",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const rows = await db
      .select({
        id: departmentsTable.id,
        name: departmentsTable.name,
        userCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM ${usersTable}
          WHERE ${usersTable.departmentId} = ${departmentsTable.id}
        )`,
      })
      .from(departmentsTable)
      .where(eq(departmentsTable.orgId, orgId))
      .orderBy(departmentsTable.name);
    res.json(rows.map((r) => ({ id: r.id, name: r.name, userCount: Number(r.userCount) })));
  },
);

router.post(
  "/admin/departments",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const parsed = AdminCreateDepartmentBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const orgId = req.auth!.user.orgId;
    const name = parsed.data.name.trim();
    if (!name) {
      sendProblem(res, 400, "Invalid Body", "Department name is required.");
      return;
    }
    const existing = (
      await db
        .select()
        .from(departmentsTable)
        .where(
          and(eq(departmentsTable.orgId, orgId), eq(departmentsTable.name, name)),
        )
        .limit(1)
    )[0];
    if (existing) {
      sendProblem(
        res,
        409,
        "Duplicate Department",
        `A department named "${name}" already exists.`,
      );
      return;
    }
    let created;
    try {
      [created] = await db
        .insert(departmentsTable)
        .values({ orgId, name })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        sendProblem(
          res,
          409,
          "Duplicate Department",
          `A department named "${name}" already exists.`,
        );
        return;
      }
      throw err;
    }
    res.status(201).json({ id: created.id, name: created.name, userCount: 0 });
  },
);

router.patch(
  "/admin/departments/:id",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const parsed = AdminRenameDepartmentBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const orgId = req.auth!.user.orgId;
    const name = parsed.data.name.trim();
    if (!name) {
      sendProblem(res, 400, "Invalid Body", "Department name is required.");
      return;
    }
    const existing = (
      await db
        .select()
        .from(departmentsTable)
        .where(
          and(eq(departmentsTable.id, id), eq(departmentsTable.orgId, orgId)),
        )
        .limit(1)
    )[0];
    if (!existing) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    if (existing.name !== name) {
      const dup = (
        await db
          .select()
          .from(departmentsTable)
          .where(
            and(
              eq(departmentsTable.orgId, orgId),
              eq(departmentsTable.name, name),
            ),
          )
          .limit(1)
      )[0];
      if (dup && dup.id !== id) {
        sendProblem(
          res,
          409,
          "Duplicate Department",
          `A department named "${name}" already exists.`,
        );
        return;
      }
    }
    let updated;
    try {
      [updated] = await db
        .update(departmentsTable)
        .set({ name })
        .where(eq(departmentsTable.id, id))
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        sendProblem(
          res,
          409,
          "Duplicate Department",
          `A department named "${name}" already exists.`,
        );
        return;
      }
      throw err;
    }
    const userCountRow = (
      await db
        .select({
          c: sql<number>`COUNT(*)::int`,
        })
        .from(usersTable)
        .where(eq(usersTable.departmentId, updated.id))
    )[0];
    res.json({
      id: updated.id,
      name: updated.name,
      userCount: Number(userCountRow?.c ?? 0),
    });
  },
);

router.delete(
  "/admin/departments/:id",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const orgId = req.auth!.user.orgId;
    const existing = (
      await db
        .select()
        .from(departmentsTable)
        .where(
          and(eq(departmentsTable.id, id), eq(departmentsTable.orgId, orgId)),
        )
        .limit(1)
    )[0];
    if (!existing) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    const userRows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.departmentId, id))
      .limit(1);
    if (userRows.length > 0) {
      sendProblem(
        res,
        409,
        "Department In Use",
        "Reassign users off this department before deleting it.",
      );
      return;
    }
    const reportRows = await db
      .select({ id: expenseReportsTable.id })
      .from(expenseReportsTable)
      .where(eq(expenseReportsTable.departmentId, id))
      .limit(1);
    if (reportRows.length > 0) {
      sendProblem(
        res,
        409,
        "Department In Use",
        "Existing expense reports reference this department. Reassign or remove them first.",
      );
      return;
    }
    await db.delete(departmentsTable).where(eq(departmentsTable.id, id));
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
    // Snapshot the row BEFORE the update so we can write a real before/after
    // fieldDiff into the QBO audit log. GL-mapping changes feed straight into
    // posted JournalEntry account refs, so reviewers explicitly need to see
    // who switched what mapping and when under the QBO audit category.
    const [before] = await db
      .select()
      .from(glMappingsTable)
      .where(and(eq(glMappingsTable.id, id), eq(glMappingsTable.orgId, orgId)))
      .limit(1);
    if (!before) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    const updates: Partial<typeof glMappingsTable.$inferInsert> = {};
    if (parsed.data.qboAccount !== undefined) updates.qboAccount = parsed.data.qboAccount;
    if (parsed.data.qboAccountId !== undefined)
      updates.qboAccountId = parsed.data.qboAccountId;
    if (parsed.data.qboAccountType !== undefined)
      updates.qboAccountType = parsed.data.qboAccountType;
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
    const fieldDiffs: Array<{ field: string; before: unknown; after: unknown }> = [];
    const tracked: ReadonlyArray<keyof typeof glMappingsTable.$inferSelect> = [
      "qboAccount",
      "qboAccountId",
      "qboAccountType",
      "active",
    ];
    for (const k of tracked) {
      if (before[k] !== updated[k]) {
        fieldDiffs.push({ field: String(k), before: before[k], after: updated[k] });
      }
    }
    if (fieldDiffs.length > 0) {
      await recordQboAudit({
        orgId,
        actor: req.auth!.user,
        entityType: "qbo_mapping",
        entityId: updated.id,
        action: "updated",
        fieldDiffs,
      });
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

// QuickBooks Online admin endpoints. The connection has two modes:
//   - "stub": demo connection with no real Intuit credentials. connect-stub
//     simulates the OAuth dance for screenshots/demos.
//   - "real": org has stored encrypted Intuit Client ID/Secret. The OAuth
//     start/callback routes exchange a real authorization code into tokens,
//     and posting routes call the live Accounting API.
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
    const orgId = req.auth!.user.orgId;
    const before = await ensureConnectionRow(orgId);
    const conn = await connectQboStub(orgId);
    await recordQboAudit({
      orgId,
      actor: req.auth!.user,
      entityType: "qbo_config",
      entityId: conn.id,
      action: "updated",
      fieldDiffs: [
        { field: "mode", before: before.mode, after: conn.mode },
        { field: "status", before: before.status, after: conn.status },
        { field: "realmId", before: before.realmId, after: conn.realmId },
        { field: "companyName", before: before.companyName, after: conn.companyName },
      ],
    });
    res.json(toQboConnectionDto(conn));
  },
);

router.post(
  "/admin/qbo-connection/disconnect",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const before = await ensureConnectionRow(orgId);
    // Real-mode disconnect revokes the refresh token before clearing tokens
    // AND encrypted Client ID / Client Secret from the row. Stub-mode just
    // resets the row.
    const wasReal = hasRealCredentials(before);
    const conn = wasReal
      ? await disconnectQboReal({ orgId })
      : await disconnectQboStub(orgId);
    const fieldDiffs: Array<{ field: string; before: unknown; after: unknown }> =
      [
        { field: "status", before: before.status, after: conn.status },
        { field: "mode", before: before.mode, after: conn.mode },
      ];
    if (wasReal) {
      // Surface in the audit log that the encrypted credentials were wiped.
      // We never log plaintext — only the boolean before/after state.
      fieldDiffs.push(
        {
          field: "hasClientId",
          before: Boolean(before.clientIdEncrypted),
          after: false,
        },
        {
          field: "hasClientSecret",
          before: Boolean(before.clientSecretEncrypted),
          after: false,
        },
        {
          field: "hasAccessToken",
          before: Boolean(before.accessTokenEncrypted),
          after: false,
        },
        {
          field: "hasRefreshToken",
          before: Boolean(before.refreshTokenEncrypted),
          after: false,
        },
      );
    }
    await recordQboAudit({
      orgId,
      actor: req.auth!.user,
      entityType: "qbo_config",
      entityId: conn.id,
      action: "updated",
      fieldDiffs,
    });
    res.json(toQboConnectionDto(conn));
  },
);

// PUT /admin/qbo-connection/credentials — store the encrypted Client ID and
// Client Secret plus environment. Pass `null` for either field to clear it.
// The plaintext is never echoed back; the response uses `hasClientId` /
// `clientIdMasked`.
router.put(
  "/admin/qbo-connection/credentials",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const parsed = SaveQboCredentialsBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const orgId = req.auth!.user.orgId;
    const before = await ensureConnectionRow(orgId);
    let conn;
    try {
      conn = await saveQboCredentials({
        orgId,
        environment: parsed.data.environment,
        ...(parsed.data.clientId !== undefined
          ? { clientId: parsed.data.clientId }
          : {}),
        ...(parsed.data.clientSecret !== undefined
          ? { clientSecret: parsed.data.clientSecret }
          : {}),
      });
    } catch (err) {
      sendProblem(
        res,
        400,
        "Cannot Save Credentials",
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
    await recordQboAudit({
      orgId,
      actor: req.auth!.user,
      entityType: "qbo_config",
      entityId: conn.id,
      action: "updated",
      fieldDiffs: [
        { field: "environment", before: before.environment, after: conn.environment },
        {
          field: "hasClientId",
          before: hasRealCredentials(before),
          after: hasRealCredentials(conn),
        },
      ],
    });
    res.json(toQboConnectionDto(conn));
  },
);

// PATCH /admin/qbo-connection/posting-preferences — auto-post-on-approval flag,
// memo template, default payable account.
router.patch(
  "/admin/qbo-connection/posting-preferences",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const parsed = SaveQboPostingPreferencesBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const orgId = req.auth!.user.orgId;
    const before = await ensureConnectionRow(orgId);
    const conn = await savePostingPreferences({
      orgId,
      ...(parsed.data.autoPostOnApproval !== undefined
        ? { autoPostOnApproval: parsed.data.autoPostOnApproval }
        : {}),
      ...(parsed.data.defaultMemoTemplate !== undefined
        ? { defaultMemoTemplate: parsed.data.defaultMemoTemplate }
        : {}),
      ...(parsed.data.defaultPayableAccountId !== undefined
        ? { defaultPayableAccountId: parsed.data.defaultPayableAccountId }
        : {}),
      ...(parsed.data.defaultPayableAccountName !== undefined
        ? { defaultPayableAccountName: parsed.data.defaultPayableAccountName }
        : {}),
    });
    await recordQboAudit({
      orgId,
      actor: req.auth!.user,
      entityType: "qbo_config",
      entityId: conn.id,
      action: "updated",
      fieldDiffs: [
        {
          field: "autoPostOnApproval",
          before: before.autoPostOnApproval,
          after: conn.autoPostOnApproval,
        },
        {
          field: "defaultPayableAccountId",
          before: before.defaultPayableAccountId,
          after: conn.defaultPayableAccountId,
        },
      ],
    });
    res.json(toQboConnectionDto(conn));
  },
);

// POST /admin/qbo-connection/oauth/start — return the Intuit authorization URL
// the browser should be redirected to.
router.post(
  "/admin/qbo-connection/oauth/start",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    let redirectUri: string;
    try {
      redirectUri = resolveQboRedirectUri(req);
    } catch (err) {
      if (err instanceof QboRedirectConfigError) {
        sendProblem(res, 400, "QBO Redirect URI Not Configured", err.message, err.code);
        return;
      }
      throw err;
    }
    try {
      const result = await startQboOauth({
        orgId,
        userId: req.auth!.user.id,
        redirectUri,
      });
      res.json({ url: result.url });
    } catch (err) {
      sendProblem(
        res,
        400,
        "OAuth Start Failed",
        err instanceof Error ? err.message : String(err),
      );
    }
  },
);

// POST /admin/qbo-connection/preflight — dry-run validation (encryption key,
// decryptable creds, environment reachability, redirect URI, optional Client
// ID probe). Read-only; safe to retry.
router.post(
  "/admin/qbo-connection/preflight",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    let redirectUri: string;
    let redirectError: string | null = null;
    try {
      redirectUri = resolveQboRedirectUri(req);
    } catch (err) {
      if (err instanceof QboRedirectConfigError) {
        redirectUri = "";
        redirectError = err.message;
      } else {
        throw err;
      }
    }
    const result = await runQboPreflight({
      orgId,
      resolvedRedirectUri: redirectUri,
      redirectError,
    });
    res.json(result);
  },
);

// (The OAuth callback /admin/qbo-connection/oauth/callback is registered by
// routes/qboOauth.ts because it is hit by Intuit's browser redirect and
// cannot satisfy requireAuth. Authentication there flows through the
// one-time `state` token instead.)

// POST /admin/qbo-connection/refresh-token — manual token refresh button.
router.post(
  "/admin/qbo-connection/refresh-token",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const conn = await refreshOrgTokensIfNeeded({ orgId, force: true });
    await recordQboAudit({
      orgId,
      actor: req.auth!.user,
      entityType: "qbo_config",
      entityId: conn.id,
      action: "updated",
      fieldDiffs: [
        {
          field: "manualTokenRefresh",
          before: null,
          after: conn.lastTokenRefreshAt?.toISOString() ?? null,
        },
      ],
    });
    res.json(toQboConnectionDto(conn));
  },
);

// GET /admin/qbo-connection/health — detailed connection-health snapshot for
// the admin Health card. Includes everything in the QboConnection summary
// plus the most recent token-refresh attempts so admins can debug why a
// connection is in `refresh_failed` / `reconnect_required` state without
// digging through the audit log.
router.get(
  "/admin/qbo-connection/health",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const health = await getConnectionHealth(orgId);
    res.json(health);
  },
);

// GET /admin/qbo-connection/posting-history — recent posting events
// (success + failure), most recent first.
router.get(
  "/admin/qbo-connection/posting-history",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const limitParam = Number(req.query["limit"] ?? "25");
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.trunc(limitParam), 1), 100)
      : 25;
    const items = await listPostingHistory({ orgId, limit });
    res.json(items);
  },
);

// GET /admin/qbo-connection/accounts — Chart of Accounts typeahead source.
// Real-mode hits the cached Account list (refreshed from QBO when stale or
// when ?refresh=true). Stub-mode returns an empty array.
router.get(
  "/admin/qbo-connection/accounts",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const refresh = String(req.query["refresh"] ?? "false").toLowerCase() === "true";
    const q = ((req.query["q"] as string | undefined) ?? "").toLowerCase().trim();
    const accounts = await listChartOfAccounts({ orgId, forceRefresh: refresh });
    const filtered = q
      ? accounts.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.fullyQualifiedName.toLowerCase().includes(q) ||
            a.accountType.toLowerCase().includes(q),
        )
      : accounts;
    res.json(filtered);
  },
);

// ---------------------------------------------------------------------------
// QBO Tags
// ---------------------------------------------------------------------------
router.get(
  "/admin/qbo-tags",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const rows = await listTags(orgId);
    res.json(
      rows.map((r) => ({ id: r.id, name: r.name, color: r.color, active: r.active })),
    );
  },
);

router.post(
  "/admin/qbo-tags",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const parsed = CreateQboTagBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const orgId = req.auth!.user.orgId;
    const row = await createTag({
      orgId,
      name: parsed.data.name,
      color: parsed.data.color ?? null,
    });
    await recordQboAudit({
      orgId,
      actor: req.auth!.user,
      entityType: "qbo_tag",
      entityId: row.id,
      action: "created",
      fieldDiffs: [
        { field: "name", before: null, after: row.name },
        { field: "color", before: null, after: row.color },
      ],
    });
    res.status(201).json({ id: row.id, name: row.name, color: row.color, active: row.active });
  },
);

router.patch(
  "/admin/qbo-tags/:id",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const parsed = UpdateQboTagBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const orgId = req.auth!.user.orgId;
    const row = await updateTag({
      orgId,
      id,
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
    });
    if (!row) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    await recordQboAudit({
      orgId,
      actor: req.auth!.user,
      entityType: "qbo_tag",
      entityId: row.id,
      action: "updated",
      fieldDiffs: Object.entries(parsed.data).map(([k, v]) => ({
        field: k,
        before: null,
        after: v ?? null,
      })),
    });
    res.json({ id: row.id, name: row.name, color: row.color, active: row.active });
  },
);

router.delete(
  "/admin/qbo-tags/:id",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const id = pathId(req, "id");
    const orgId = req.auth!.user.orgId;
    const row = await deleteTag({ orgId, id });
    if (!row) {
      sendProblem(res, 404, "Not Found");
      return;
    }
    await recordQboAudit({
      orgId,
      actor: req.auth!.user,
      entityType: "qbo_tag",
      entityId: row.id,
      action: "deleted",
      fieldDiffs: [{ field: "name", before: row.name, after: null }],
    });
    res.status(204).end();
  },
);

// Merged audit trail: workflow status transitions (approval_actions) plus
// field-level content edits (audit_entries), interleaved by createdAt
// descending so the admin Audit Log page renders one chronological feed.
// Defaults to org-wide; pass ?reportId=<uuid> to scope to a single report.
router.get(
  "/admin/audit-log",
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const reportIdParam = (req.query["reportId"] as string | undefined) ?? null;
    const categoryParamRaw = (req.query["category"] as string | undefined) ?? null;
    const categoryParam =
      categoryParamRaw === "report" || categoryParamRaw === "qbo"
        ? categoryParamRaw
        : null;
    const limitParam = Number(req.query["limit"] ?? "100");
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.trunc(limitParam), 1), 500)
      : 100;
    // approval_actions has no org column directly; join through expense_reports
    // to enforce org isolation (and to support the optional reportId filter).
    const approvalWhere = reportIdParam
      ? and(
          eq(expenseReportsTable.orgId, orgId),
          eq(approvalActionsTable.reportId, reportIdParam),
        )
      : eq(expenseReportsTable.orgId, orgId);
    const auditConditions = [eq(auditEntriesTable.orgId, orgId)];
    if (reportIdParam) {
      auditConditions.push(eq(auditEntriesTable.reportId, reportIdParam));
    }
    if (categoryParam) {
      auditConditions.push(eq(auditEntriesTable.category, categoryParam));
    }
    const auditWhere =
      auditConditions.length === 1 ? auditConditions[0] : and(...auditConditions);
    // Approvals are workflow transitions on reports, so they only make sense
    // when the user is looking at "report" history. Skip them when scoped to
    // QBO config / tag / mapping / posting events.
    const skipApprovals = categoryParam === "qbo";
    // Pull `limit` rows from each table separately; we'll merge in JS and
    // truncate. Asking for `limit` from each side guarantees we never miss
    // a row that would have placed in the top `limit` of the merged feed.
    const [approvalRows, auditRows] = await Promise.all([
      skipApprovals
        ? Promise.resolve([])
        : db
            .select()
            .from(approvalActionsTable)
            .innerJoin(
              expenseReportsTable,
              eq(approvalActionsTable.reportId, expenseReportsTable.id),
            )
            .innerJoin(usersTable, eq(approvalActionsTable.actorId, usersTable.id))
            .where(approvalWhere)
            .orderBy(desc(approvalActionsTable.createdAt))
            .limit(limit),
      db
        .select()
        .from(auditEntriesTable)
        .innerJoin(usersTable, eq(auditEntriesTable.actorId, usersTable.id))
        .where(auditWhere)
        .orderBy(desc(auditEntriesTable.createdAt))
        .limit(limit),
    ]);
    const items: ChangeFeedItemDto[] = [
      ...approvalRows.map((row) => ({
        kind: "approval" as const,
        createdAt: row.approval_actions.createdAt.toISOString(),
        approval: toApprovalActionDto(row.approval_actions, row.users),
        content: null,
      })),
      ...auditRows.map((row) => ({
        kind: "content" as const,
        createdAt: row.audit_entries.createdAt.toISOString(),
        approval: null,
        content: toAuditEntryDto(row.audit_entries, toUserRef(row.users)),
      })),
    ];
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(items.slice(0, limit));
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
    if (
      !from.roles.some((r) => okRoles.has(r)) ||
      !to.roles.some((r) => okRoles.has(r))
    ) {
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

// ----------------------------------------------------------------------------
// Backup & Restore (System Admin only)
// ----------------------------------------------------------------------------
//
// `GET /admin/backup` streams a ZIP of the caller's org-scoped tables. The
// optional `includeReceiptFiles=1` query also embeds receipt blobs from
// object storage.
//
// `POST /admin/restore` accepts a multipart upload of a previously-exported
// zip plus a `confirm` field that must equal the literal string "RESTORE".
// The endpoint refuses to touch anything until both are present.
//
// Both routes validate the manifest's `orgId` matches the caller's org so
// admins cannot accidentally swap one tenant's data for another's.

router.get(
  "/admin/backup",
  requireRole(...SYSADMIN_ROLES),
  async (req, res): Promise<void> => {
    const includeReceiptFiles =
      typeof req.query.includeReceiptFiles === "string" &&
      ["1", "true", "yes"].includes(req.query.includeReceiptFiles);
    // Backup mode: "full" (default) or "config". Anything other than the
    // explicit "config" string falls back to full so legacy callers and
    // typo'd query params behave conservatively.
    const mode: "full" | "config" =
      typeof req.query.mode === "string" && req.query.mode === "config"
        ? "config"
        : "full";

    try {
      const result = await exportBackup({
        orgId: req.auth!.user.orgId,
        appVersion: APP_VERSION,
        mode,
        includeReceiptFiles,
      });
      const ts = result.manifest.createdAt.replace(/[:.]/g, "-");
      const filenamePart = mode === "config" ? "config-backup" : "backup";
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="healthtrix-${filenamePart}-${ts}.zip"`,
      );
      res.setHeader("X-Backup-Schema-Version", String(CURRENT_BACKUP_SCHEMA_VERSION));
      res.setHeader("X-Backup-App-Version", result.manifest.appVersion);
      res.setHeader("X-Backup-Org-Id", result.manifest.orgId);
      res.setHeader("X-Backup-Mode", result.manifest.mode);
      res.setHeader(
        "X-Backup-Includes-Receipt-Files",
        result.manifest.includesReceiptFiles ? "1" : "0",
      );
      res.setHeader(
        "X-Backup-Receipt-Warnings",
        String(result.receiptFileWarnings.length),
      );
      res.status(200).end(result.zip);
    } catch (err) {
      sendProblem(res, 500, "Backup Failed", (err as Error).message);
    }
  },
);

const restoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB safety cap
});

router.post(
  "/admin/restore",
  requireRole(...SYSADMIN_ROLES),
  restoreUpload.single("backup"),
  async (req, res): Promise<void> => {
    const confirm =
      typeof req.body?.confirm === "string" ? (req.body.confirm as string) : "";
    if (confirm !== "RESTORE") {
      sendProblem(
        res,
        400,
        "Confirmation Required",
        'Send a "confirm" field equal to the literal string "RESTORE".',
      );
      return;
    }
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      sendProblem(
        res,
        400,
        "Missing File",
        'Upload the backup zip in a multipart field named "backup".',
      );
      return;
    }
    try {
      const result = await applyRestore({
        orgId: req.auth!.user.orgId,
        zipBuffer: file.buffer,
      });
      res.json({
        manifest: result.manifest,
        rowCountsRestored: result.rowCountsRestored,
        receiptFilesRestored: result.receiptFilesRestored,
        receiptFileWarnings: result.receiptFileWarnings,
      });
    } catch (err) {
      if (err instanceof BackupOrgMismatchError) {
        sendProblem(res, 400, "Wrong Org", err.message, "backup.org_mismatch");
        return;
      }
      if (err instanceof BackupVersionError) {
        sendProblem(
          res,
          400,
          "Unsupported Version",
          err.message,
          "backup.unsupported_version",
        );
        return;
      }
      if (err instanceof BackupParseError) {
        sendProblem(res, 400, "Invalid Backup", err.message, "backup.invalid");
        return;
      }
      sendProblem(res, 500, "Restore Failed", (err as Error).message);
    }
  },
);

// ----------------------------------------------------------------------------
// Full-system backup + factory reset (System Admin only) — Task #41
// ----------------------------------------------------------------------------
//
// `GET  /admin/system-backup`  — streams a single ZIP holding one per-org
//                                backup zip for every org in the system,
//                                plus a top-level manifest. This is the
//                                forced safety-net the Reset dialog
//                                downloads before letting the admin
//                                continue. We log who downloaded it and
//                                when so the trail survives a wipe.
// `POST /admin/system-reset`   — wipes every org's operational data and
//                                re-seeds the factory defaults. Requires
//                                a `confirm` body field equal to the
//                                literal string "RESET" (mirrors the
//                                restore endpoint's contract).

router.get(
  "/admin/system-backup",
  requireRole(...SYSADMIN_ROLES),
  async (req, res): Promise<void> => {
    const includeReceiptFiles =
      typeof req.query.includeReceiptFiles === "string" &&
      ["1", "true", "yes"].includes(req.query.includeReceiptFiles);
    try {
      const result = await exportFullSystemBackup({
        appVersion: APP_VERSION,
        includeReceiptFiles,
      });
      const ts = result.manifest.createdAt.replace(/[:.]/g, "-");
      // Best-effort observability: log who downloaded the safety-net so
      // the trail is preserved even after the wipe blows away audit
      // entries.
      // eslint-disable-next-line no-console
      console.info(
        `[system-backup] downloaded by user=${req.auth!.user.id} email=${
          req.auth!.user.email
        } orgs=${result.manifest.orgCount} includeReceipts=${includeReceiptFiles} at=${result.manifest.createdAt}`,
      );
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="healthtrix-system-backup-${ts}.zip"`,
      );
      res.setHeader(
        "X-System-Backup-Org-Count",
        String(result.manifest.orgCount),
      );
      res.setHeader(
        "X-System-Backup-Includes-Receipt-Files",
        includeReceiptFiles ? "1" : "0",
      );
      res.status(200).end(result.zip);
    } catch (err) {
      sendProblem(res, 500, "System Backup Failed", (err as Error).message);
    }
  },
);

router.post(
  "/admin/system-reset",
  requireRole(...SYSADMIN_ROLES),
  async (req, res): Promise<void> => {
    const confirm =
      typeof req.body?.confirm === "string" ? (req.body.confirm as string) : "";
    if (confirm !== "RESET") {
      sendProblem(
        res,
        400,
        "Confirmation Required",
        'Send a "confirm" field equal to the literal string "RESET".',
      );
      return;
    }
    try {
      const summary = await applySystemReset({
        actingUserId: req.auth!.user.id,
      });
      // eslint-disable-next-line no-console
      console.info(
        `[system-reset] executed by user=${req.auth!.user.id} email=${
          req.auth!.user.email
        } orgsReset=${summary.orgsReset.length} orgsFailed=${
          summary.orgsFailed.length
        } receiptFilesDeleted=${summary.receiptFilesDeleted} receiptWarnings=${
          summary.receiptFileWarnings.length
        }`,
      );
      res.json(summary);
    } catch (err) {
      sendProblem(res, 500, "System Reset Failed", (err as Error).message);
    }
  },
);

// Suppress unused-import lint for or/isNull (kept for future SQL filters).
void or;
void isNull;

function pathId(req: Request, key: string): string {
  const raw = (req.params as Record<string, string | string[]>)[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

// Detect Postgres unique-constraint violations (SQLSTATE 23505) so we can
// translate concurrent-insert races into clean 409 responses instead of
// surfacing as 500s.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

export default router;
