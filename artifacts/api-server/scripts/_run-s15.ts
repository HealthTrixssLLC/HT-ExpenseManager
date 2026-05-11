import { db, pool, expenseReportsTable, qboPostingEventsTable, lineItemsTable, departmentsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { postReportToQbo } from "../src/services/qbo.js";
import { applyTransition } from "../src/services/workflow.js";

const ORG = "5571ee4c-6b8f-4a01-b78c-3daa7639b961";

const [dept] = await db.select({ id: departmentsTable.id }).from(departmentsTable).where(eq(departmentsTable.orgId, ORG)).limit(1);
const [emp] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, "davemeyer@healthtrixss.com"));
const [finance] = await db.select({ id: usersTable.id, roles: usersTable.roles }).from(usersTable).where(eq(usersTable.email, "qbo-finance@healthtrix.test"));
const code = `S15-${randomUUID().slice(0, 6).toUpperCase()}`;
const [report] = await db.insert(expenseReportsTable).values({
  orgId: ORG, employeeId: emp.id, departmentId: dept.id, displayCode: code, title: "S15 inject 500",
  status: "Finance Approved", submittedAt: new Date(),
}).returning();
await db.insert(lineItemsTable).values([{
  reportId: report.id, occurredOn: "2026-05-10", merchant: "Test", description: "Travel:Airfare",
  category: "Travel:Airfare", amount: "100.00", paymentMethod: "Personal Card",
}]);
console.log(`Created report ${report.id} (${code})`);

let jeAttempts = 0;
const realFetch = globalThis.fetch;
const injectedFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : input.url);
  if (url.includes("/journalentry")) {
    jeAttempts++;
    return new Response(JSON.stringify({ Fault: { Error: [{ Message: "Internal server error", Detail: "QBO had a moment.", code: "5010" }], type: "ServerFault" } }),
      { status: 500, headers: { "content-type": "application/json" } });
  }
  return realFetch(input, init);
};

const out = await postReportToQbo(report, { fetchFn: injectedFetch });
console.log("postReportToQbo:", { status: out.status, errorMessage: out.errorMessage, jeAttempts });

// Mirror what /reports/:id/post-to-qbo does on the error path.
if (out.status === "error") {
  await applyTransition({
    report,
    actor: { id: finance.id, roles: finance.roles },
    transition: "postQboError",
    comment: out.errorMessage,
    metadata: JSON.stringify({ errorMessage: out.errorMessage }),
  });
}

const events = await db.select().from(qboPostingEventsTable).where(eq(qboPostingEventsTable.reportId, report.id)).orderBy(desc(qboPostingEventsTable.createdAt));
const [after] = await db.select({ status: expenseReportsTable.status }).from(expenseReportsTable).where(eq(expenseReportsTable.id, report.id));
console.log("posting events:", events.map((e) => ({ status: e.status, error: e.errorMessage?.slice(0, 80), retry: e.retry })));
console.log("Report status now:", after.status);
console.log("S15 PASS:", {
  retried: jeAttempts >= 4, // initial + 3 retries
  eventErrorWithMessage: events.length === 1 && events[0].status === "error" && /500|Internal|server/i.test(events[0].errorMessage ?? ""),
  reportTransitionedToSyncError: after.status === "Sync Error",
});

await pool.end();
