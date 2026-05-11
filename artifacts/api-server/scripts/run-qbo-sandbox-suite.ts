/* eslint-disable no-console */
/**
 * Driver for the QBO Sandbox JE test plan (task #85).
 *
 * Run with:
 *   pnpm --filter @workspace/api-server exec tsx \
 *     scripts/run-qbo-sandbox-suite.ts <command>
 *
 * Commands:
 *   probe-accounts       - Query Intuit for the sandbox chart of accounts.
 *   setup-fixtures       - Set default payable + memo template; create
 *                          Manager Approver + Finance Approver users; create
 *                          a tag. Idempotent.
 *   inspect              - Dump current connection + fixtures state.
 *   reset-org            - Run the §10.1 SQL block against the test org
 *                          (keeps connection + GL mappings + users + tags).
 *
 *   make-report <title> <employeeId> [tagName...]
 *                        - Create a Finance-Approved report with three
 *                          line items spanning two mapped categories.
 *                          Prints the report id + display code.
 *   post-report <reportId>
 *                        - Call postReportToQbo() and print the result.
 *   post-tagged-scenario - Regression guard for the "invalid Tag property"
 *                          bug (task #89): create a Finance-Approved report
 *                          with the "Project Alpha" tag assigned, post it
 *                          end-to-end against the live Intuit sandbox, and
 *                          assert (a) the post succeeds, (b) the persisted
 *                          payload has no `Tag` property on JournalEntry,
 *                          and (c) the PrivateNote carries the tag names.
 *
 * Per-scenario drivers (S2, S15, etc.) live in the companion one-shot
 * scripts referenced from docs/qbo-sandbox-je-test-results.md
 * (`_run-server-scenarios.ts`, `_run-s15.ts`).
 *
 * Test org is hard-coded to the existing already-connected sandbox org.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const ORG_ID = "5571ee4c-6b8f-4a01-b78c-3daa7639b961";

if (!process.env["DATABASE_URL"]) {
  console.error("ABORT: DATABASE_URL not set.");
  process.exit(1);
}
if (!process.env["QBO_CREDENTIAL_ENCRYPTION_KEY"]) {
  console.error("ABORT: QBO_CREDENTIAL_ENCRYPTION_KEY not set.");
  process.exit(1);
}

const {
  db,
  pool,
  orgsTable,
  usersTable,
  qboConnectionTable,
  qboPostingEventsTable,
  qboTokenRefreshLogTable,
  qboOauthStatesTable,
  qboTagsTable,
  qboTagAssignmentsTable,
  expenseReportsTable,
  lineItemsTable,
  receiptsTable,
  departmentsTable,
  glMappingsTable,
  auditEntriesTable,
  approvalActionsTable,
} = await import("@workspace/db");
const { and, eq, inArray, sql } = await import("drizzle-orm");

const qbo = await import("../src/services/qbo.js");
const intuit = await import("../src/services/intuitClient.js");
const enc = await import("../src/lib/encryption.js");

function arg(i: number): string | undefined {
  return process.argv[i + 2];
}

async function inspect() {
  const [conn] = await db
    .select()
    .from(qboConnectionTable)
    .where(eq(qboConnectionTable.orgId, ORG_ID));
  console.log("connection:", {
    mode: conn.mode,
    status: conn.status,
    health: conn.connectionHealth,
    environment: conn.environment,
    realmId: conn.realmId,
    companyName: conn.companyName,
    defaultPayableAccountId: conn.defaultPayableAccountId,
    defaultPayableAccountName: conn.defaultPayableAccountName,
    defaultMemoTemplate: conn.defaultMemoTemplate,
    autoPostOnApproval: conn.autoPostOnApproval,
    tokenExpiresAt: conn.tokenExpiresAt,
    lastSyncError: conn.lastSyncError,
  });
  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      fullName: usersTable.fullName,
      roles: usersTable.roles,
    })
    .from(usersTable)
    .where(eq(usersTable.orgId, ORG_ID));
  console.log("users:");
  for (const u of users) console.log(" -", u.email, u.roles);
  const tags = await db
    .select()
    .from(qboTagsTable)
    .where(eq(qboTagsTable.orgId, ORG_ID));
  console.log("tags:", tags.map((t) => t.name));
}

async function probeAccounts() {
  const accounts = await qbo.listChartOfAccounts({
    orgId: ORG_ID,
    forceRefresh: true,
  });
  console.log(`Got ${accounts.length} accounts.`);
  // Print AP-shaped candidates for default_payable.
  const candidates = accounts.filter(
    (a) =>
      a.active &&
      (a.accountType === "Accounts Payable" ||
        a.accountType === "Other Current Liability" ||
        /payable|reimburs/i.test(a.name)),
  );
  console.log("\nPayable / Other Current Liability candidates:");
  for (const a of candidates) {
    console.log(
      ` - id=${a.id.padEnd(4)} type=${a.accountType.padEnd(24)} name=${a.name}`,
    );
  }
  console.log("\nAll accounts (id, type, subtype, name):");
  for (const a of accounts) {
    console.log(
      ` - ${a.id.padEnd(4)} ${a.accountType.padEnd(28)} ${(a.accountSubType ?? "").padEnd(28)} ${a.name}`,
    );
  }
}

async function setupFixtures() {
  // Pick the default payable account.
  //
  // The plan §3.3 originally suggested an Accounts Payable account, but
  // real-Intuit testing showed AP requires a Vendor reference on the
  // credit line (filed as follow-up Bug #3). The current execution run
  // therefore standardised on a Loan Payable / Other Current Liability
  // account, mirrored here so re-runs are consistent with the run sheet.
  // Override with `--payable=<accountId>` if needed.
  const accounts = await qbo.listChartOfAccounts({ orgId: ORG_ID });
  const overrideArg = process.argv.find((a) => a.startsWith("--payable="));
  const overrideId = overrideArg ? overrideArg.slice("--payable=".length) : null;
  const payable = overrideId
    ? accounts.find((a) => a.id === overrideId && a.active)
    : accounts.find(
        (a) =>
          a.active &&
          a.accountType === "Other Current Liability" &&
          /loan payable/i.test(a.name),
      ) ??
      accounts.find(
        (a) => a.active && a.accountType === "Other Current Liability",
      );
  if (!payable)
    throw new Error(
      "No suitable payable account (Loan Payable / Other Current Liability) found in sandbox; pass --payable=<accountId>.",
    );
  const ap = payable;
  console.log(
    `Using default payable: id=${ap.id} type=${ap.accountType} name=${ap.name}`,
  );
  await db
    .update(qboConnectionTable)
    .set({
      defaultPayableAccountId: ap.id,
      defaultPayableAccountName: ap.name,
      defaultMemoTemplate:
        "Healthtrix Expense — {displayCode} — {title}",
      lastSyncError: null,
    })
    .where(eq(qboConnectionTable.orgId, ORG_ID));

  // Ensure dedicated Manager Approver and Finance Approver users exist
  // (separate from Jay Baker who has all roles).
  async function ensureUser(opts: {
    email: string;
    fullName: string;
    roles: string[];
  }): Promise<string> {
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.orgId, ORG_ID),
          eq(usersTable.email, opts.email),
        ),
      );
    if (existing.length > 0) return existing[0].id;
    const [u] = await db
      .insert(usersTable)
      .values({
        orgId: ORG_ID,
        email: opts.email,
        passwordHash: "$2a$10$qboTestUserDoNotUseToLogIn",
        fullName: opts.fullName,
        roles: opts.roles as (typeof usersTable.$inferInsert)["roles"],
        isActive: true,
      })
      .returning({ id: usersTable.id });
    console.log(`created user ${opts.email} -> ${u.id}`);
    return u.id;
  }
  const managerId = await ensureUser({
    email: "qbo-manager@healthtrix.test",
    fullName: "QBO Test Manager",
    roles: ["Manager Approver"],
  });
  const financeId = await ensureUser({
    email: "qbo-finance@healthtrix.test",
    fullName: "QBO Test Finance",
    roles: ["Finance Approver"],
  });

  // Ensure a tag exists.
  const tagName = "Project Alpha";
  const existingTag = await db
    .select({ id: qboTagsTable.id })
    .from(qboTagsTable)
    .where(
      and(eq(qboTagsTable.orgId, ORG_ID), eq(qboTagsTable.name, tagName)),
    );
  let tagId: string;
  if (existingTag.length > 0) {
    tagId = existingTag[0].id;
  } else {
    const [t] = await db
      .insert(qboTagsTable)
      .values({ orgId: ORG_ID, name: tagName })
      .returning({ id: qboTagsTable.id });
    tagId = t.id;
    console.log(`created tag '${tagName}' -> ${tagId}`);
  }
  console.log("Setup complete.", { managerId, financeId, tagId });
}

async function makeReport(
  title: string,
  employeeId: string,
  tagNames: string[],
): Promise<{ reportId: string; displayCode: string }> {
  const [dept] = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(eq(departmentsTable.orgId, ORG_ID))
    .limit(1);
  const code = `S6-${randomUUID().slice(0, 6).toUpperCase()}`;
  const [report] = await db
    .insert(expenseReportsTable)
    .values({
      orgId: ORG_ID,
      employeeId,
      departmentId: dept.id,
      displayCode: code,
      title,
      status: "Finance Approved",
      submittedAt: new Date(),
    })
    .returning({ id: expenseReportsTable.id });
  // Three lines spanning two mapped categories.
  await db.insert(lineItemsTable).values([
    {
      reportId: report.id,
      occurredOn: "2026-05-10",
      merchant: "Delta Airlines",
      description: "Flight to client",
      category: "Travel:Airfare",
      amount: "320.00",
      paymentMethod: "Personal Card",
    },
    {
      reportId: report.id,
      occurredOn: "2026-05-10",
      merchant: "Uber",
      description: "Airport transfer",
      category: "Travel:Ground Transportation",
      amount: "55.50",
      paymentMethod: "Personal Card",
    },
    {
      reportId: report.id,
      occurredOn: "2026-05-10",
      merchant: "Coffee shop",
      description: "Client lunch",
      category: "Meals & Entertainment",
      amount: "50.00",
      paymentMethod: "Personal Card",
    },
  ]);
  if (tagNames.length > 0) {
    const tags = await db
      .select()
      .from(qboTagsTable)
      .where(
        and(
          eq(qboTagsTable.orgId, ORG_ID),
          inArray(qboTagsTable.name, tagNames),
        ),
      );
    if (tags.length > 0) {
      await db.insert(qboTagAssignmentsTable).values(
        tags.map((t) => ({ orgId: ORG_ID, reportId: report.id, tagId: t.id })),
      );
    }
  }
  return { reportId: report.id, displayCode: code };
}

async function postReportCmd(reportId: string) {
  const [report] = await db
    .select()
    .from(expenseReportsTable)
    .where(eq(expenseReportsTable.id, reportId));
  if (!report) throw new Error(`report ${reportId} not found`);
  const out = await qbo.postReportToQbo(report);
  console.log(JSON.stringify(out, null, 2));
}

async function resetOrg() {
  await db.transaction(async (tx) => {
    await tx
      .delete(qboPostingEventsTable)
      .where(eq(qboPostingEventsTable.orgId, ORG_ID));
    const reports = await tx
      .select({ id: expenseReportsTable.id })
      .from(expenseReportsTable)
      .where(eq(expenseReportsTable.orgId, ORG_ID));
    const reportIds = reports.map((r) => r.id);
    if (reportIds.length > 0) {
      await tx
        .delete(qboTagAssignmentsTable)
        .where(inArray(qboTagAssignmentsTable.reportId, reportIds));
      await tx
        .delete(approvalActionsTable)
        .where(inArray(approvalActionsTable.reportId, reportIds));
      await tx
        .delete(receiptsTable)
        .where(inArray(receiptsTable.reportId, reportIds));
      await tx
        .delete(lineItemsTable)
        .where(inArray(lineItemsTable.reportId, reportIds));
      await tx
        .delete(expenseReportsTable)
        .where(inArray(expenseReportsTable.id, reportIds));
    }
    await tx
      .delete(qboOauthStatesTable)
      .where(eq(qboOauthStatesTable.orgId, ORG_ID));
    // Trim audit entries from prior runs (keep qbo_config history).
    await tx
      .delete(auditEntriesTable)
      .where(
        and(
          eq(auditEntriesTable.orgId, ORG_ID),
          inArray(auditEntriesTable.entityType, [
            "report",
            "line_item",
            "receipt",
            "qbo_posting",
          ]),
        ),
      );
  });
  console.log("Org reset (§10.1) complete.");
}

async function loadFinanceUser(): Promise<string> {
  const [u] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.orgId, ORG_ID),
        eq(usersTable.email, "qbo-finance@healthtrix.test"),
      ),
    );
  if (!u) throw new Error("Finance user missing — run setup-fixtures first.");
  return u.id;
}

async function loadEmployeeUser(): Promise<string> {
  const [u] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.orgId, ORG_ID),
        eq(usersTable.email, "davemeyer@healthtrixss.com"),
      ),
    );
  if (!u) throw new Error("Employee user davemeyer not found.");
  return u.id;
}

const cmd = (process.argv[2] ?? "").toLowerCase();
try {
  switch (cmd) {
    case "inspect":
      await inspect();
      break;
    case "probe-accounts":
      await probeAccounts();
      break;
    case "setup-fixtures":
      await setupFixtures();
      break;
    case "reset-org":
      await resetOrg();
      break;
    case "make-report": {
      const title = arg(1) ?? "Test Report";
      const empArg = arg(2);
      const employeeId = empArg ?? (await loadEmployeeUser());
      const tagNames = process.argv.slice(5);
      const r = await makeReport(title, employeeId, tagNames);
      console.log(JSON.stringify(r));
      break;
    }
    case "post-report": {
      const id = arg(1);
      if (!id) throw new Error("usage: post-report <reportId>");
      await postReportCmd(id);
      break;
    }
    case "post-tagged-scenario": {
      // Regression guard for task #89: posting a tagged report used to
      // crash with "Request has invalid or unsupported property" because
      // the JE payload included a top-level `Tag` field that Intuit's
      // JournalEntry schema does not define. We now drop the Tag header
      // and append tag names to PrivateNote instead. Validate that the
      // post succeeds end-to-end against the live sandbox AND that the
      // persisted payload reflects the new shape.
      const tagName = "Project Alpha";
      const employeeId = await loadEmployeeUser();
      const { reportId, displayCode } = await makeReport(
        "Tagged JE Regression (task #89)",
        employeeId,
        [tagName],
      );
      console.log(`Created tagged report ${displayCode} (${reportId})`);
      const [report] = await db
        .select()
        .from(expenseReportsTable)
        .where(eq(expenseReportsTable.id, reportId));
      const result = await qbo.postReportToQbo(report);
      console.log(JSON.stringify(result, null, 2));
      assert.notEqual(
        result.status,
        "error",
        `Tagged JE post failed: ${
          result.status === "error" ? result.errorMessage : ""
        }`,
      );
      const events = await db
        .select()
        .from(qboPostingEventsTable)
        .where(eq(qboPostingEventsTable.reportId, reportId));
      assert.equal(events.length, 1, "expected exactly one posting event");
      const payload = events[0].payload as {
        JournalEntry: Record<string, unknown>;
      };
      assert.ok(
        !("Tag" in payload.JournalEntry),
        "JournalEntry payload must not include a Tag property",
      );
      assert.ok(
        String(payload.JournalEntry.PrivateNote ?? "").includes(tagName),
        `PrivateNote should include the tag name '${tagName}'`,
      );
      assert.deepEqual(events[0].tagsSent, [tagName]);
      console.log(
        "PASS: tagged JE posted to sandbox; payload has no Tag header; PrivateNote carries tags.",
      );
      break;
    }
    default:
      console.error("Unknown command:", cmd);
      console.error("See file header for usage.");
      process.exit(2);
  }
} catch (err) {
  console.error("FAILED:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}

void assert;
void enc;
void intuit;
void sql;
