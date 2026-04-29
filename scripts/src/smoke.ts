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

  // GL preview balances on the first Manager Approved report. We also assert
  // that the GL preview has ONE debit line PER CATEGORY (not per account),
  // matching the gl_mappings contract — distinct categories that happen to
  // map to the same account must remain distinct lines.
  const ma = fq.find((r) => r.status === "Manager Approved");
  if (ma) {
    const fullReport = (await getJson(
      `/reports/${ma.id}`,
      sessions["finance@healthtrix.test"].token,
    )) as { lineItems: Array<{ category: string }> };
    const distinctCategories = new Set(
      fullReport.lineItems.map((l) => l.category),
    );
    const preview = (await getJson(
      `/reports/${ma.id}/gl-preview`,
      sessions["finance@healthtrix.test"].token,
    )) as {
      totalDebits: string;
      totalCredits: string;
      debits: Array<{ account: string; category: string; amount: string }>;
    };
    assert(
      preview.totalDebits === preview.totalCredits,
      `GL preview balances (${preview.totalDebits} vs ${preview.totalCredits})`,
    );
    assert(preview.debits.length > 0, "GL preview has debits");
    const debitCats = new Set(preview.debits.map((d) => d.category));
    assert(
      debitCats.size === preview.debits.length,
      `GL preview debits must be one-per-category, got ${preview.debits.length} lines for ${debitCats.size} unique categories`,
    );
    assert(
      preview.debits.length === distinctCategories.size,
      `GL preview debit count (${preview.debits.length}) must equal distinct line-item categories (${distinctCategories.size})`,
    );
    console.log(
      `✓ GL preview for ${ma.displayCode}: ${preview.totalDebits} balanced; ${preview.debits.length} debit line(s) = distinct categories`,
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

  // Positive: scope=finance is status-restricted. A Finance Approver must NOT
  // see Draft / Submitted / Manager Review / Changes Requested / Rejected.
  // (Admins can see those via scope=all; finance has no business with them.)
  const FINANCE_VISIBLE = new Set([
    "Manager Approved",
    "Finance Review",
    "Finance Approved",
    "Posted to QuickBooks",
    "Ready for Payroll Reimbursement",
    "Paid Through Payroll",
    "Reconciled",
    "Sync Error",
    "Voided",
  ]);
  const financeScope = (await getJson(
    "/reports?scope=finance",
    sessions["finance@healthtrix.test"].token,
  )) as Array<{ id: string; status: string }>;
  assert(
    financeScope.every((r) => FINANCE_VISIBLE.has(r.status)),
    `finance scope leaks pre-manager-approval reports: ${financeScope
      .filter((r) => !FINANCE_VISIBLE.has(r.status))
      .map((r) => r.status)
      .join(", ")}`,
  );
  console.log(
    `✓ finance /reports?scope=finance returned ${financeScope.length} reports, all in finance-visible statuses`,
  );

  // Positive: a Finance Approver requesting a specific Draft report by id is
  // also rejected (canView enforcement, not just listing). We use the admin's
  // scope=all view to find a Draft id.
  const draft = allReports.find(
    (r: { id: string; status?: string }) =>
      (r as { status?: string }).status === "Draft",
  ) as { id: string; status?: string } | undefined;
  if (draft) {
    const financeReadDraft = await fetch(`${BASE}/reports/${draft.id}`, {
      headers: {
        authorization: `Bearer ${sessions["finance@healthtrix.test"].token}`,
        "x-healthtrix-client": "ios",
      },
    });
    assert(
      financeReadDraft.status === 403,
      `finance blocked from Draft report (got ${financeReadDraft.status})`,
    );
    console.log(
      `✓ finance correctly blocked from Draft report by id (403)`,
    );

    // Same row-level rule must apply to /reports/:id/gl-preview, not just the
    // top-level read. A Finance Approver guessing a Draft id should NOT get
    // its general-ledger preview either.
    const financeGlDraft = await fetch(
      `${BASE}/reports/${draft.id}/gl-preview`,
      {
        headers: {
          authorization: `Bearer ${sessions["finance@healthtrix.test"].token}`,
          "x-healthtrix-client": "ios",
        },
      },
    );
    assert(
      financeGlDraft.status === 403,
      `finance blocked from Draft GL preview (got ${financeGlDraft.status})`,
    );
    console.log(
      `✓ finance correctly blocked from Draft /gl-preview by id (403)`,
    );
  }

  // /lookups/categories must surface ONLY active GL mappings (admins see
  // the full list including inactive at /admin/gl-mappings).
  const cats2 = (await getJson(
    "/lookups/categories",
    sessions["priya@healthtrix.test"].token,
  )) as Array<{ code: string; active: boolean }>;
  assert(
    cats2.every((c) => c.active === true),
    `/lookups/categories must only return active mappings`,
  );
  console.log(
    `✓ /lookups/categories returns only active mappings (${cats2.length})`,
  );

  // Admin policy rules: list + upsert via PATCH.
  const ruleList = (await getJson(
    "/admin/policy-rules",
    sessions["admin@healthtrix.test"].token,
  )) as Array<{ name: string; value: unknown }>;
  assert(Array.isArray(ruleList), "GET /admin/policy-rules returns array");
  const patchRule = await fetch(`${BASE}/admin/policy-rules`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${sessions["admin@healthtrix.test"].token}`,
      "x-healthtrix-client": "ios",
    },
    body: JSON.stringify({
      name: "smoke.test.rule",
      value: { hello: "world" },
      description: "smoke",
    }),
  });
  assert(
    patchRule.status === 200,
    `PATCH /admin/policy-rules ok (got ${patchRule.status})`,
  );
  console.log(`✓ admin policy rules GET + PATCH work`);

  // A made-up report id must return 404 (RFC-7807 problem+json), NOT 500.
  const ghost = await fetch(
    `${BASE}/reports/00000000-0000-0000-0000-000000000000`,
    {
      headers: {
        authorization: `Bearer ${sessions["admin@healthtrix.test"].token}`,
        "x-healthtrix-client": "ios",
      },
    },
  );
  assert(
    ghost.status === 404,
    `unknown report id should be 404 (got ${ghost.status})`,
  );
  console.log(`✓ unknown report id returns 404 (problem+json)`);

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
