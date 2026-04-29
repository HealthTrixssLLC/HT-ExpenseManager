import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { and, eq } from "drizzle-orm";
import {
  AdminCreateUserBody as CreateUserBody,
  AdminGetQboConnectionResponse,
  AdminListGlMappingsResponse,
  AdminListUsersResponse,
  AdminUpdateGlMappingBody as UpdateGlMappingBody,
  AdminUpdatePolicyRuleBody as UpdatePolicyRuleBody,
  AdminUpdateQboConnectionBody as UpdateQboConnectionBody,
  AdminUpdateUserBody as UpdateUserBody,
} from "@workspace/api-zod";
import {
  db,
  departmentsTable,
  glMappingsTable,
  policyRulesTable,
  qboConnectionTable,
  usersTable,
} from "../lib/db";
import { hashPassword } from "../lib/auth";
import { sendProblem } from "../lib/problem";
import { requireAuth, requireRole } from "../middlewares/session";
import {
  toGlMappingDto,
  toPolicyRuleDto,
  toQboConnectionDto,
  toUserDto,
} from "../lib/serializers";

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

router.put(
  "/admin/policy-rules/:name",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const name = pathId(req, "name");
    const parsed = UpdatePolicyRuleBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const orgId = req.auth!.user.orgId;
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

router.get(
  "/admin/qbo/connection",
  requireRole(...ADMIN_ROLES),
  async (req, res): Promise<void> => {
    const orgId = req.auth!.user.orgId;
    const conn = await ensureQboConnection(orgId);
    res.json(AdminGetQboConnectionResponse.parse(toQboConnectionDto(conn)));
  },
);

router.put(
  "/admin/qbo/connection",
  requireRole(...ADMIN_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = UpdateQboConnectionBody.safeParse(req.body);
    if (!parsed.success) {
      sendProblem(res, 400, "Invalid Body", parsed.error.message);
      return;
    }
    const orgId = req.auth!.user.orgId;
    await ensureQboConnection(orgId);
    const updates =
      parsed.data.action === "connect"
        ? {
            status: "connected" as const,
            realmId: "STUB-REALM-1234567890",
            companyName: "Healthtrix Sandbox Co.",
            connectedAt: new Date(),
            lastSyncError: null,
          }
        : {
            status: "disconnected" as const,
            realmId: null,
            companyName: null,
            connectedAt: null,
          };
    const [updated] = await db
      .update(qboConnectionTable)
      .set(updates)
      .where(eq(qboConnectionTable.orgId, orgId))
      .returning();
    res.json(toQboConnectionDto(updated));
  },
);

async function ensureQboConnection(orgId: string) {
  const existing = (
    await db
      .select()
      .from(qboConnectionTable)
      .where(eq(qboConnectionTable.orgId, orgId))
      .limit(1)
  )[0];
  if (existing) return existing;
  const [created] = await db
    .insert(qboConnectionTable)
    .values({ orgId })
    .returning();
  return created;
}

function pathId(req: Request, key: string): string {
  const raw = (req.params as Record<string, string | string[]>)[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export default router;
