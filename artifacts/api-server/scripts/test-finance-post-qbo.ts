/* eslint-disable no-console */
/**
 * Route-level integration tests for POST /api/reports/:id/post-to-qbo
 * (and its sibling /retry-qbo). Mounts the finance router on a tiny
 * express app with a stubbed auth middleware, then drives the route
 * end-to-end against a real Postgres + a stub-mode QBO connection so
 * we can assert response shape AND workflow transitions actually
 * happened — without having to talk to Intuit.
 *
 * Coverage:
 *  - Happy path (regression for task #93): a Finance Approved report
 *    posts cleanly, the response is 200 with status="posted", and the
 *    report row advances to "Ready for Payroll Reimbursement" with a
 *    qbo_posting_events row written.
 *  - Auto-advance decoupling: when the second
 *    applyTransition('readyForPayroll') call would normally throw, the
 *    request must NOT 5xx. The QBO post is the source of truth — the
 *    report ends in "Posted to QuickBooks" with a logged warning, and
 *    the response still reports status="posted" + the journal id.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AddressInfo } from "node:net";

if (!process.env["DATABASE_URL"]) {
  console.error("SKIP: DATABASE_URL not set; finance-post-qbo suite needs a DB.");
  process.exit(0);
}
process.env["QBO_CREDENTIAL_ENCRYPTION_KEY"] ??=
  "test-key-for-finance-post-qbo-suite-please-replace-in-prod";

const expressMod = await import("express");
const express = expressMod.default;

const {
  db,
  pool,
  orgsTable,
  usersTable,
  qboConnectionTable,
  qboPostingEventsTable,
  expenseReportsTable,
  lineItemsTable,
  departmentsTable,
  approvalActionsTable,
  glMappingsTable,
  auditEntriesTable,
} = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");

const financeRouterMod = await import("../src/routes/finance.js");
const financeRouter = financeRouterMod.default;
const { connectQboStub } = await import("../src/services/qbo.js");
const workflowMod = await import("../src/services/workflow.js");

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

const createdOrgIds: string[] = [];
async function makeOrgWithFinanceUser(label: string): Promise<{
  orgId: string;
  userId: string;
}> {
  const [org] = await db
    .insert(orgsTable)
    .values({ name: `__test_${label}_${randomUUID().slice(0, 8)}` })
    .returning();
  createdOrgIds.push(org.id);
  const [user] = await db
    .insert(usersTable)
    .values({
      orgId: org.id,
      email: `${label}-${randomUUID().slice(0, 8)}@example.com`,
      passwordHash: "x",
      fullName: "Finance Test User",
      roles: ["Finance Approver"],
      isActive: true,
    })
    .returning();
  return { orgId: org.id, userId: user.id };
}

function startApp(auth: { orgId: string; userId: string }): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const app = express();
  app.use(express.json());
  // Stub session middleware: inject the auth context the real
  // requireAuth/requireRole middlewares look for.
  app.use((req, _res, next) => {
    (req as unknown as { auth: unknown }).auth = {
      user: {
        id: auth.userId,
        orgId: auth.orgId,
        roles: ["Finance Approver"],
      },
    };
    next();
  });
  app.use(financeRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

async function makeFinanceApprovedReport(args: {
  orgId: string;
  userId: string;
  label: string;
}): Promise<string> {
  const [dept] = await db
    .insert(departmentsTable)
    .values({ orgId: args.orgId, name: "Test Dept" })
    .returning();
  const [report] = await db
    .insert(expenseReportsTable)
    .values({
      orgId: args.orgId,
      employeeId: args.userId,
      departmentId: dept.id,
      title: `Route test ${args.label}`,
      status: "Finance Approved",
      displayCode: `RT-${randomUUID().slice(0, 6).toUpperCase()}`,
    })
    .returning();
  await db.insert(lineItemsTable).values({
    reportId: report.id,
    occurredOn: "2026-05-10",
    merchant: "Test Merchant",
    description: "Lunch",
    category: "Meals & Entertainment",
    amount: "100.00",
    paymentMethod: "Personal Card",
  });
  return report.id;
}

console.log("/api/reports/:id/post-to-qbo route tests\n");

await test(
  "POST /reports/:id/post-to-qbo: success advances Finance Approved → Ready for Payroll Reimbursement (regression for task #93)",
  async () => {
    const { orgId, userId } = await makeOrgWithFinanceUser("postToQboHappy");
    await connectQboStub(orgId);
    const reportId = await makeFinanceApprovedReport({
      orgId,
      userId,
      label: "happy",
    });
    const app = await startApp({ orgId, userId });
    try {
      const res = await fetch(`${app.url}/reports/${reportId}/post-to-qbo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "" }),
      });
      assert.equal(res.status, 200, `expected 200, got ${res.status}`);
      const body = (await res.json()) as {
        status: string;
        journalId: string | null;
        report: { status: string };
      };
      assert.equal(body.status, "posted");
      assert.ok(body.journalId, "expected non-null journal id");
      assert.equal(
        body.report.status,
        "Ready for Payroll Reimbursement",
        "report should auto-advance to Ready for Payroll Reimbursement",
      );

      // Verify DB side-effects.
      const [dbReport] = await db
        .select()
        .from(expenseReportsTable)
        .where(eq(expenseReportsTable.id, reportId));
      assert.equal(dbReport.status, "Ready for Payroll Reimbursement");
      const events = await db
        .select()
        .from(qboPostingEventsTable)
        .where(eq(qboPostingEventsTable.reportId, reportId));
      assert.equal(events.length, 1);
      assert.ok(
        ["posted", "retried"].includes(events[0].status),
        `expected posted/retried, got ${events[0].status}`,
      );
      assert.ok(events[0].journalId, "expected journal id on event");
    } finally {
      await app.close();
    }
  },
);

await test(
  "POST /reports/:id/post-to-qbo: auto-advance failure does NOT 5xx (decouple readyForPayroll from QBO post response)",
  async () => {
    const { orgId, userId } = await makeOrgWithFinanceUser("postToQboAdvanceFail");
    await connectQboStub(orgId);
    const reportId = await makeFinanceApprovedReport({
      orgId,
      userId,
      label: "advanceFail",
    });

    // Simulate the auto-advance failing. The route runs two
    // applyTransition calls back-to-back: postQbo (Finance Approved →
    // Posted to QuickBooks) and then readyForPayroll (Posted to
    // QuickBooks → Ready for Payroll Reimbursement). Use the test seam
    // to force the readyForPayroll call to throw the same way an
    // illegal transition (e.g. concurrent edit) would.
    let interceptedCalls = 0;
    workflowMod.__setTestApplyTransitionHook((input) => {
      if (input.transition === "readyForPayroll") {
        interceptedCalls += 1;
        return new Error("simulated illegal transition (concurrent edit)");
      }
      return null;
    });

    const app = await startApp({ orgId, userId });
    try {
      const res = await fetch(`${app.url}/reports/${reportId}/post-to-qbo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "" }),
      });
      assert.equal(
        res.status,
        200,
        `auto-advance failure must not 5xx; got ${res.status}`,
      );
      const body = (await res.json()) as {
        status: string;
        journalId: string | null;
        report: { status: string };
      };
      assert.equal(body.status, "posted");
      assert.ok(body.journalId, "expected non-null journal id even when advance fails");
      assert.equal(
        body.report.status,
        "Posted to QuickBooks",
        "report should remain at Posted to QuickBooks when auto-advance throws",
      );
      assert.equal(interceptedCalls, 1, "auto-advance should have been attempted exactly once");

      const [dbReport] = await db
        .select()
        .from(expenseReportsTable)
        .where(eq(expenseReportsTable.id, reportId));
      assert.equal(dbReport.status, "Posted to QuickBooks");
    } finally {
      workflowMod.__setTestApplyTransitionHook(null);
      await app.close();
    }
  },
);

// Cleanup.
console.log("\nCleaning up…");
let cleanFails = 0;
for (const id of createdOrgIds) {
  try {
    const reports = await db
      .select({ id: expenseReportsTable.id })
      .from(expenseReportsTable)
      .where(eq(expenseReportsTable.orgId, id));
    const reportIds = reports.map((r) => r.id);
    if (reportIds.length > 0) {
      await db
        .delete(approvalActionsTable)
        .where(inArray(approvalActionsTable.reportId, reportIds));
      await db
        .delete(lineItemsTable)
        .where(inArray(lineItemsTable.reportId, reportIds));
      await db
        .delete(qboPostingEventsTable)
        .where(inArray(qboPostingEventsTable.reportId, reportIds));
      await db
        .delete(expenseReportsTable)
        .where(inArray(expenseReportsTable.id, reportIds));
    }
    await db.delete(glMappingsTable).where(eq(glMappingsTable.orgId, id));
    await db.delete(departmentsTable).where(eq(departmentsTable.orgId, id));
    await db.delete(qboConnectionTable).where(eq(qboConnectionTable.orgId, id));
    await db.delete(auditEntriesTable).where(eq(auditEntriesTable.orgId, id));
    await db.delete(usersTable).where(eq(usersTable.orgId, id));
    await db.delete(orgsTable).where(eq(orgsTable.id, id));
  } catch (err) {
    cleanFails += 1;
    console.warn(`  ! failed to cleanup org ${id}:`, err);
  }
}
console.log(`Cleaned ${createdOrgIds.length} org(s) (${cleanFails} failures).`);

await pool.end();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
