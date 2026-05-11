import { db, pool, qboConnectionTable, qboOauthStatesTable, glMappingsTable, expenseReportsTable, qboTokenRefreshLogTable, lineItemsTable, departmentsTable, usersTable } from "@workspace/db";
const glMappingTable = glMappingsTable;
import { and, eq, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { handleQboOauthCallback, postReportToQbo } from "../src/services/qbo.js";

const ORG = "5571ee4c-6b8f-4a01-b78c-3daa7639b961";

async function makeReport(title: string, lines: Array<{ category: string; amount: string; merchant: string }>) {
  const [dept] = await db.select({ id: departmentsTable.id }).from(departmentsTable).where(eq(departmentsTable.orgId, ORG)).limit(1);
  const [emp] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, "davemeyer@healthtrixss.com"));
  const code = `S-${randomUUID().slice(0, 6).toUpperCase()}`;
  const [report] = await db.insert(expenseReportsTable).values({
    orgId: ORG, employeeId: emp.id, departmentId: dept.id, displayCode: code, title,
    status: "Finance Approved", submittedAt: new Date(),
  }).returning({ id: expenseReportsTable.id });
  await db.insert(lineItemsTable).values(lines.map((l) => ({
    reportId: report.id, occurredOn: "2026-05-10", merchant: l.merchant, description: l.category,
    category: l.category, amount: l.amount, paymentMethod: "Personal Card" as const,
  })));
  return { reportId: report.id, displayCode: code };
}

console.log("\n========== S2: oauth state expiry ==========");
const fakeState = "TEST_STATE_" + Date.now();
await db.insert(qboOauthStatesTable).values({
  orgId: ORG, state: fakeState, createdById: "5a5093af-c985-413f-a3f7-634e3025dfb4",
  expiresAt: new Date(Date.now() - 1000),
});
const s2 = await handleQboOauthCallback({ state: fakeState, code: "fakeCode", realmId: "9341457053035148", redirectUri: "https://x/cb" });
console.log("S2 result:", s2);
console.log("S2 PASS:", s2.ok === false && /expired/i.test(s2.errorMessage ?? ""));

console.log("\n========== S10c: missing GL mapping ==========");
const allMaps = await db.select().from(glMappingTable).where(eq(glMappingTable.orgId, ORG));
console.log("Mapped categories:", allMaps.filter((m) => m.isActive).map((m) => m.expenseCategory).slice(0, 20));
const fakeCat = "Bogus Unmapped Category XYZ";
const r10c = await makeReport("S10c missing mapping", [{ category: fakeCat, amount: "12.34", merchant: "Test Vendor" }]);
console.log("Created:", r10c);
const [reportRow] = await db.select().from(expenseReportsTable).where(eq(expenseReportsTable.id, r10c.reportId));
const post10c = await postReportToQbo(reportRow);
console.log("S10c result:", { status: post10c.status, errorMessage: post10c.errorMessage });
console.log("S10c PASS:", post10c.status === "error" && /mapping|GL|category|missing/i.test(post10c.errorMessage ?? ""));

console.log("\n========== S11: stale token forces refresh ==========");
const before = await db.select().from(qboTokenRefreshLogTable).where(eq(qboTokenRefreshLogTable.orgId, ORG)).orderBy(desc(qboTokenRefreshLogTable.createdAt)).limit(1);
const beforeId = before[0]?.id ?? null;
console.log("Last refresh log id before:", beforeId);
await db.update(qboConnectionTable).set({ tokenExpiresAt: new Date(Date.now() - 60_000) }).where(eq(qboConnectionTable.orgId, ORG));
const r11 = await makeReport("S11 stale token", [{ category: "Travel:Airfare", amount: "100.00", merchant: "Delta" }]);
const [r11row] = await db.select().from(expenseReportsTable).where(eq(expenseReportsTable.id, r11.reportId));
const post11 = await postReportToQbo(r11row);
console.log("S11 post result:", { status: post11.status, errorMessage: post11.errorMessage });
const after = await db.select().from(qboTokenRefreshLogTable).where(eq(qboTokenRefreshLogTable.orgId, ORG)).orderBy(desc(qboTokenRefreshLogTable.createdAt)).limit(1);
console.log("New refresh log entry:", after[0] ? { id: after[0].id, success: after[0].success, error: after[0].errorMessage, createdAt: after[0].createdAt } : null);
console.log("S11 token-refresh PASS:", after[0]?.id !== beforeId && after[0]?.success === true);

await pool.end();
