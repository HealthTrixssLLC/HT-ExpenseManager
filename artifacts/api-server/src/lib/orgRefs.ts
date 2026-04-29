import { and, eq } from "drizzle-orm";
import { db, departmentsTable, usersTable } from "./db";

export async function assertSameOrgRefs(
  orgId: string,
  refs: {
    departmentId?: string | null;
    managerId?: string | null;
  },
): Promise<string | null> {
  if (refs.departmentId) {
    const [dept] = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(
        and(
          eq(departmentsTable.id, refs.departmentId),
          eq(departmentsTable.orgId, orgId),
        ),
      )
      .limit(1);
    if (!dept) return "departmentId does not belong to your organisation.";
  }
  if (refs.managerId) {
    const [mgr] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(eq(usersTable.id, refs.managerId), eq(usersTable.orgId, orgId)),
      )
      .limit(1);
    if (!mgr) return "managerId does not belong to your organisation.";
  }
  return null;
}
