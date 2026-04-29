/* eslint-disable no-console */
/**
 * End-to-end smoke test against the running API server.
 *
 * Logs in as each role using the email/password set up by the seed script,
 * exercises the queue endpoints, and verifies that key invariants hold:
 *   - login returns a session with the expected role
 *   - employee sees their own reports under /reports?scope=mine
 *   - manager sees Submitted/Manager Review reports under /approvals/manager-queue
 *   - finance sees Manager Approved/etc under /approvals/finance-queue
 *   - finance sees Ready for Payroll Reimbursement under /payroll/queue
 *   - admin can list users
 *   - GL preview returns balanced debits/credits for a finance-approved report
 */
const BASE = process.env["API_BASE"] ?? "http://localhost:8080/api";
const PASSWORD = "Healthtrix!2026";

type LoginResp = {
  user: { id: string; email: string; role: string; fullName: string };
  csrfToken: string;
  sessionExpiresAt: string;
  sessionToken: string | null;
};

async function login(email: string): Promise<LoginResp> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-healthtrix-client": "ios", // bearer-token mode = no cookie/CSRF needed
    },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(
      `Login failed for ${email}: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as LoginResp;
}

async function getJson(
  path: string,
  token: string,
): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      "x-healthtrix-client": "ios",
    },
  });
  if (!res.ok) {
    throw new Error(
      `${path} failed: ${res.status} ${await res.text()}`,
    );
  }
  return res.json();
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function main(): Promise<void> {
  console.log(`API base: ${BASE}`);
  const health = (await fetch(`${BASE}/health`).then((r) => r.json())) as {
    ok: boolean;
    db: string;
  };
  assert(health.ok, "health check");
  console.log(`✓ health ok (db=${health.db})`);

  const roles: Array<{ email: string; role: string }> = [
    { email: "admin@healthtrix.test", role: "System Admin" },
    { email: "accounting@healthtrix.test", role: "Accounting Admin" },
    { email: "finance@healthtrix.test", role: "Finance Approver" },
    { email: "manager@healthtrix.test", role: "Manager Approver" },
    { email: "priya@healthtrix.test", role: "Employee" },
  ];

  const sessions: Record<string, { token: string; userId: string }> = {};
  for (const r of roles) {
    const session = await login(r.email);
    assert(session.sessionToken, `${r.email}: token returned`);
    assert(session.user.role === r.role, `${r.email}: role=${r.role}`);
    sessions[r.email] = {
      token: session.sessionToken!,
      userId: session.user.id,
    };
    console.log(`✓ login ${r.email} → ${session.user.role}`);
  }

  // /auth/me echo
  const me = (await getJson(
    "/auth/me",
    sessions["finance@healthtrix.test"].token,
  )) as LoginResp;
  assert(me.user.email === "finance@healthtrix.test", "auth/me echo");

  // Employee scope
  const mine = (await getJson(
    "/reports?scope=mine",
    sessions["priya@healthtrix.test"].token,
  )) as Array<{ id: string; status: string; employee: { fullName: string } }>;
  assert(
    mine.every((r) => r.employee.fullName === "Priya Raghavan"),
    "employee sees only their reports",
  );
  console.log(`✓ employee /reports?scope=mine returned ${mine.length} reports`);

  // Manager queue
  const mq = (await getJson(
    "/approvals/manager-queue",
    sessions["manager@healthtrix.test"].token,
  )) as Array<{ id: string; status: string }>;
  assert(
    mq.every((r) => ["Submitted", "Manager Review"].includes(r.status)),
    "manager queue contains only Submitted/Manager Review",
  );
  assert(mq.length > 0, "manager queue non-empty");
  console.log(`✓ manager /approvals/manager-queue returned ${mq.length} reports`);

  // Finance queue
  const fq = (await getJson(
    "/approvals/finance-queue",
    sessions["finance@healthtrix.test"].token,
  )) as Array<{ id: string; status: string; displayCode: string }>;
  assert(
    fq.every((r) =>
      [
        "Manager Approved",
        "Finance Review",
        "Finance Approved",
        "Sync Error",
      ].includes(r.status),
    ),
    "finance queue contains only finance-relevant statuses",
  );
  assert(fq.length > 0, "finance queue non-empty");
  console.log(`✓ finance /approvals/finance-queue returned ${fq.length} reports`);

  // Payroll queue
  const pq = (await getJson(
    "/payroll/queue",
    sessions["finance@healthtrix.test"].token,
  )) as Array<{ id: string; status: string }>;
  assert(
    pq.every((r) => r.status === "Ready for Payroll Reimbursement"),
    "payroll queue is only Ready for Payroll Reimbursement",
  );
  console.log(`✓ finance /payroll/queue returned ${pq.length} reports`);

  // GL preview balances on the first Manager Approved report
  const ma = fq.find((r) => r.status === "Manager Approved");
  if (ma) {
    const preview = (await getJson(
      `/reports/${ma.id}/gl-preview`,
      sessions["finance@healthtrix.test"].token,
    )) as {
      totalDebits: string;
      totalCredits: string;
      debits: Array<{ account: string; amount: string }>;
    };
    assert(
      preview.totalDebits === preview.totalCredits,
      `GL preview balances (${preview.totalDebits} vs ${preview.totalCredits})`,
    );
    assert(preview.debits.length > 0, "GL preview has debits");
    console.log(
      `✓ GL preview for ${ma.displayCode}: ${preview.totalDebits} balanced across ${preview.debits.length} accounts`,
    );
  }

  // Admin can list users
  const users = (await getJson(
    "/admin/users",
    sessions["admin@healthtrix.test"].token,
  )) as Array<{ email: string; role: string }>;
  assert(users.length >= roles.length, "admin sees all seeded users");
  console.log(`✓ admin /admin/users returned ${users.length} users`);

  // Lookups (any authenticated user)
  const cats = (await getJson(
    "/lookups/categories",
    sessions["priya@healthtrix.test"].token,
  )) as unknown[];
  assert(cats.length === 12, `12 GL categories seeded (got ${cats.length})`);
  console.log(`✓ /lookups/categories returned ${cats.length} categories`);

  // Negative: employee cannot view manager queue
  const forbid = await fetch(`${BASE}/approvals/manager-queue`, {
    headers: {
      authorization: `Bearer ${sessions["priya@healthtrix.test"].token}`,
      "x-healthtrix-client": "ios",
    },
  });
  assert(forbid.status === 403, `employee blocked from manager queue (got ${forbid.status})`);
  console.log(`✓ employee correctly blocked from /approvals/manager-queue (403)`);

  // Negative IDOR: an employee cannot fetch another employee's report.
  // Find a Marcus-owned report via the admin's "all" scope.
  const allReports = (await getJson(
    "/reports?scope=all",
    sessions["admin@healthtrix.test"].token,
  )) as Array<{ id: string; employee: { id: string; fullName: string } }>;
  const someoneElse = allReports.find(
    (r) => r.employee.id !== sessions["priya@healthtrix.test"].userId,
  );
  if (someoneElse) {
    const idor = await fetch(`${BASE}/reports/${someoneElse.id}`, {
      headers: {
        authorization: `Bearer ${sessions["priya@healthtrix.test"].token}`,
        "x-healthtrix-client": "ios",
      },
    });
    assert(
      idor.status === 403,
      `employee blocked from peer's report (got ${idor.status} for ${someoneElse.employee.fullName})`,
    );
    console.log(
      `✓ employee correctly blocked from peer's report (403, ${someoneElse.employee.fullName})`,
    );
  }

  // Negative: scope=payroll requires a finance/admin role.
  const payrollAsEmp = await fetch(`${BASE}/reports?scope=payroll`, {
    headers: {
      authorization: `Bearer ${sessions["priya@healthtrix.test"].token}`,
      "x-healthtrix-client": "ios",
    },
  });
  assert(
    payrollAsEmp.status === 403,
    `employee blocked from scope=payroll (got ${payrollAsEmp.status})`,
  );
  console.log(`✓ employee correctly blocked from /reports?scope=payroll (403)`);

  // Negative: unknown scope is rejected, not silently broadened.
  const badScope = await fetch(`${BASE}/reports?scope=everything`, {
    headers: {
      authorization: `Bearer ${sessions["priya@healthtrix.test"].token}`,
      "x-healthtrix-client": "ios",
    },
  });
  assert(
    badScope.status === 400,
    `unknown scope rejected (got ${badScope.status})`,
  );
  console.log(`✓ unknown scope rejected with 400`);

  // Negative: unauthenticated upload-url request denied.
  const noAuthUpload = await fetch(`${BASE}/receipts/upload-url`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-healthtrix-client": "ios",
    },
    body: JSON.stringify({ name: "t.jpg", size: 100, contentType: "image/jpeg" }),
  });
  assert(
    noAuthUpload.status === 401,
    `upload URL denied without auth (got ${noAuthUpload.status})`,
  );
  console.log(`✓ /receipts/upload-url denied without auth (401)`);

  console.log("\nAll smoke checks passed.");
}

main().catch((err) => {
  console.error("\nSmoke FAILED:", err);
  process.exitCode = 1;
});
