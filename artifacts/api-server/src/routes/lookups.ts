import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { ListCategoriesResponse, ListDepartmentsResponse, ListPolicyRulesResponse } from "@workspace/api-zod";
import {
  db,
  departmentsTable,
  glMappingsTable,
  policyRulesTable,
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

router.get("/lookups/policy-rules", requireAuth, async (req, res): Promise<void> => {
  const orgId = req.auth!.user.orgId;
  const rows = await db
    .select()
    .from(policyRulesTable)
    .where(eq(policyRulesTable.orgId, orgId));
  res.json(ListPolicyRulesResponse.parse(rows.map(toPolicyRuleDto)));
});

export default router;
