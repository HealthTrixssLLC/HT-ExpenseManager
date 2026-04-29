import { Router, type IRouter } from "express";
import { and, asc, eq, or } from "drizzle-orm";
import {
  ListCategoriesResponse,
  ListDepartmentsResponse,
  ListManagersResponse,
  ListPolicyRulesResponse,
} from "@workspace/api-zod";
import {
  db,
  departmentsTable,
  glMappingsTable,
  policyRulesTable,
  usersTable,
} from "../lib/db";
import { requireAuth } from "../middlewares/session";
import { toPolicyRuleDto } from "../lib/serializers";

const router: IRouter = Router();

router.get("/lookups/categories", requireAuth, async (req, res): Promise<void> => {
  const orgId = req.auth!.user.orgId;
  const rows = await db
    .select()
    .from(glMappingsTable)
    .where(eq(glMappingsTable.orgId, orgId));
  res.json(
    ListCategoriesResponse.parse(
      rows.map((m) => ({
        code: m.code,
        qboAccount: m.qboAccount,
        active: m.active,
      })),
    ),
  );
});

router.get("/lookups/departments", requireAuth, async (req, res): Promise<void> => {
  const orgId = req.auth!.user.orgId;
  const rows = await db
    .select()
    .from(departmentsTable)
    .where(eq(departmentsTable.orgId, orgId));
  res.json(
    ListDepartmentsResponse.parse(rows.map((d) => ({ id: d.id, name: d.name }))),
  );
});

router.get("/lookups/managers", requireAuth, async (req, res): Promise<void> => {
  const orgId = req.auth!.user.orgId;
  // Anyone who can sit above an employee in the approval chain.
  const rows = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.orgId, orgId),
        eq(usersTable.isActive, true),
        or(
          eq(usersTable.role, "Manager Approver"),
          eq(usersTable.role, "Finance Approver"),
          eq(usersTable.role, "Accounting Admin"),
          eq(usersTable.role, "System Admin"),
        ),
      ),
    )
    .orderBy(asc(usersTable.fullName));
  res.json(
    ListManagersResponse.parse(
      rows.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
      })),
    ),
  );
});

router.get("/lookups/policy-rules", requireAuth, async (req, res): Promise<void> => {
  const orgId = req.auth!.user.orgId;
  const rows = await db
    .select()
    .from(policyRulesTable)
    .where(eq(policyRulesTable.orgId, orgId));
  res.json(ListPolicyRulesResponse.parse(rows.map(toPolicyRuleDto)));
});

export default router;
