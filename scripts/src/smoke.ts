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
  user: { id: string; email: string; roles: string[]; fullName: string };
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
    assert(
      session.user.roles.includes(r.role as never),
      `${r.email}: roles include ${r.role}`,
    );
    sessions[r.email] = {
      token: session.sessionToken!,
      userId: session.user.id,
    };
    console.log(`✓ login ${r.email} → ${session.user.roles.join(", ")}`);
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
  // The seed no longer creates demo expense reports — Task #35 stripped the
  // REPORTS / payroll loops from `seed.ts`. So the queue is expected to be
  // empty against a freshly-seeded DB; we only assert the filter is correct.
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
  // Like the manager queue above, expected to be empty after Task #35.
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

  // ─────────────────────────────────────────────────────────────────────
  // Task #25 — broadened edit gate + content audit log + merged feed.
  //
  // Goal: editing a report's header in a post-Submit status (e.g. Manager
  // Review) by the OWNER must succeed and produce a `content` audit entry
  // visible on both the per-report timeline and the org-wide audit log.
  // We also assert the response carries `editedSinceLastApproval=true` so
  // the reviewer banner kicks in.
  // ─────────────────────────────────────────────────────────────────────
  const empToken = sessions["priya@healthtrix.test"].token;
  const empId = sessions["priya@healthtrix.test"].userId;
  const adminToken = sessions["admin@healthtrix.test"].token;

  // Find a report owned by Priya in a non-terminal, post-Draft status
  // (so we exercise the "broader than Draft/Changes Requested" gate).
  const priyaReports = (await getJson(
    "/reports?scope=mine",
    empToken,
  )) as Array<{ id: string; status: string; title: string; displayCode: string }>;
  const editableNonDraft = priyaReports.find((r) =>
    [
      "Submitted",
      "Manager Review",
      "Manager Approved",
      "Finance Review",
      "Changes Requested",
    ].includes(r.status),
  );
  if (!editableNonDraft) {
    console.log("⚠ no post-Draft editable report owned by priya — skipping audit smoke");
  } else {
    const newTitle = `${editableNonDraft.title} [edited ${Date.now()}]`;
    const editRes = await fetch(`${BASE}/reports/${editableNonDraft.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${empToken}`,
        "x-healthtrix-client": "ios",
      },
      body: JSON.stringify({ title: newTitle }),
    });
    assert(
      editRes.status === 200,
      `owner edit on ${editableNonDraft.status} report should succeed (got ${editRes.status})`,
    );
    const updated = (await editRes.json()) as {
      title: string;
      editedSinceLastApproval: boolean;
    };
    assert(updated.title === newTitle, "PATCH returned the updated title");
    assert(
      updated.editedSinceLastApproval === true,
      "edit must flip editedSinceLastApproval=true on a post-Draft report",
    );
    console.log(
      `✓ owner edited ${editableNonDraft.displayCode} (${editableNonDraft.status}); editedSinceLastApproval=true`,
    );

    // Per-report timeline must contain the new content edit.
    const tl = (await getJson(
      `/reports/${editableNonDraft.id}/timeline`,
      empToken,
    )) as Array<{
      kind: string;
      content?: {
        action: string;
        entityType: string;
        fieldDiffs: Array<{ field: string; before: unknown; after: unknown }>;
      } | null;
    }>;
    const titleEdit = tl.find(
      (e) =>
        e.kind === "content" &&
        e.content?.entityType === "report" &&
        e.content?.action === "updated" &&
        e.content.fieldDiffs.some((d) => d.field === "title"),
    );
    assert(titleEdit, "per-report timeline must contain the title edit");
    console.log(
      `✓ per-report timeline contains the title content-edit entry`,
    );

    // Org-wide admin audit log must surface the same edit (kind=content).
    const adminLog = (await getJson(
      "/admin/audit-log",
      adminToken,
    )) as Array<{
      kind: string;
      content?: { reportId: string; action: string } | null;
    }>;
    const inAdmin = adminLog.find(
      (e) =>
        e.kind === "content" &&
        e.content?.reportId === editableNonDraft.id &&
        e.content?.action === "updated",
    );
    assert(inAdmin, "admin /audit-log must surface the content edit");
    console.log(
      `✓ admin /audit-log contains the new content edit (merged feed)`,
    );

    // Hard-lock: editing a Finance Approved (or further) report MUST 403
    // even for the owner. Look one up via admin's all-scope.
    const allForLock = (await getJson(
      "/reports?scope=all",
      adminToken,
    )) as Array<{
      id: string;
      status: string;
      employee: { id: string; fullName: string };
    }>;
    const locked = allForLock.find(
      (r) =>
        r.employee.id === empId &&
        [
          "Finance Approved",
          "Posted to QuickBooks",
          "Ready for Payroll Reimbursement",
          "Paid Through Payroll",
          "Reconciled",
        ].includes(r.status),
    );
    if (locked) {
      const lockedEdit = await fetch(`${BASE}/reports/${locked.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${empToken}`,
          "x-healthtrix-client": "ios",
        },
        body: JSON.stringify({ title: "should not work" }),
      });
      // Hard-lock returns 409 "Locked" (status conflict), not 403, because
      // the actor IS authorized — it's the report's status that forbids edits.
      assert(
        lockedEdit.status === 409,
        `Finance Approved+ report must be locked (got ${lockedEdit.status} on ${locked.status})`,
      );
      console.log(
        `✓ owner correctly blocked from editing ${locked.status} report (409 Locked)`,
      );
    } else {
      console.log(
        `⚠ no locked-status report owned by priya — skipping hard-lock check`,
      );
    }

    // Manager-of-owner can also edit the same report. Manager Rosa
    // (manager@healthtrix.test) is Priya's direct manager per the seed.
    const managerToken = sessions["manager@healthtrix.test"].token;
    const mgrEditTitle = `${editableNonDraft.title} [mgr-edit ${Date.now()}]`;
    const mgrEdit = await fetch(`${BASE}/reports/${editableNonDraft.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${managerToken}`,
        "x-healthtrix-client": "ios",
      },
      body: JSON.stringify({ title: mgrEditTitle }),
    });
    assert(
      mgrEdit.status === 200,
      `direct manager must be allowed to edit owner's report (got ${mgrEdit.status})`,
    );
    console.log(`✓ direct manager edited owner's report (200)`);

    // Admin must NOT be allowed to edit content (per Task #25 — admins
    // observe and audit, they do not impersonate the owner on records).
    const adminEdit = await fetch(`${BASE}/reports/${editableNonDraft.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
        "x-healthtrix-client": "ios",
      },
      body: JSON.stringify({ title: "admin should not edit" }),
    });
    assert(
      adminEdit.status === 403,
      `admin must be blocked from editing report content (got ${adminEdit.status})`,
    );
    console.log(`✓ System Admin correctly blocked from editing content (403)`);

    // Finance approver (not owner, not manager-of-owner) must also be
    // blocked from editing — even on a report visible in the finance queue.
    const financeToken = sessions["finance@healthtrix.test"].token;
    const finEdit = await fetch(`${BASE}/reports/${editableNonDraft.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${financeToken}`,
        "x-healthtrix-client": "ios",
      },
      body: JSON.stringify({ title: "finance should not edit" }),
    });
    assert(
      finEdit.status === 403,
      `finance approver must be blocked from editing report content (got ${finEdit.status})`,
    );
    console.log(`✓ Finance Approver correctly blocked from editing content (403)`);

    // Line-item edit must also be audited. Pull the full report to find a
    // line and PATCH it as the owner; then verify a line_item content
    // entry shows up in the timeline with a description diff.
    const fullForLine = (await getJson(
      `/reports/${editableNonDraft.id}`,
      empToken,
    )) as { lineItems: Array<{ id: string; description: string }> };
    const targetLine = fullForLine.lineItems[0];
    if (targetLine) {
      const newDesc = `${targetLine.description} [edit ${Date.now()}]`;
      const linePatch = await fetch(`${BASE}/lines/${targetLine.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${empToken}`,
          "x-healthtrix-client": "ios",
        },
        body: JSON.stringify({ description: newDesc }),
      });
      assert(
        linePatch.status === 200,
        `owner line-item edit must succeed (got ${linePatch.status})`,
      );
      const tl2 = (await getJson(
        `/reports/${editableNonDraft.id}/timeline`,
        empToken,
      )) as Array<{
        kind: string;
        content?: {
          action: string;
          entityType: string;
          entityId: string;
          fieldDiffs: Array<{ field: string }>;
        } | null;
      }>;
      const lineEntry = tl2.find(
        (e) =>
          e.kind === "content" &&
          e.content?.entityType === "line_item" &&
          e.content?.entityId === targetLine.id &&
          e.content?.action === "updated" &&
          e.content.fieldDiffs.some((d) => d.field === "description"),
      );
      assert(
        lineEntry,
        "line-item edit must produce a content audit entry on the timeline",
      );
      console.log(
        `✓ line-item edit recorded as content audit entry (description diff)`,
      );
    }

    // Receipt delete is now governed by canEditReport + records an audit
    // entry. Verify (a) Finance Approver — not the owner/manager — is
    // blocked from DELETE /receipts/:id, even on a report visible in
    // their queue; and (b) the owner can delete a receipt and the delete
    // appears in the timeline as a "receipt deleted" content entry.
    // Walk Priya's editable reports until we find one that actually has
    // a receipt attached.
    let targetReceipt: { id: string; filename: string } | undefined;
    let receiptHostReportId: string | undefined;
    for (const r of priyaReports) {
      if (
        ![
          "Submitted",
          "Manager Review",
          "Manager Approved",
          "Finance Review",
          "Changes Requested",
          "Draft",
        ].includes(r.status)
      ) {
        continue;
      }
      const rs = (await getJson(
        `/reports/${r.id}/receipts`,
        empToken,
      )) as Array<{ id: string; filename: string }>;
      if (rs[0]) {
        targetReceipt = rs[0];
        receiptHostReportId = r.id;
        break;
      }
    }
    if (targetReceipt && receiptHostReportId) {
      // Finance approver should be blocked.
      const finDel = await fetch(`${BASE}/receipts/${targetReceipt.id}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${sessions["finance@healthtrix.test"].token}`,
          "x-healthtrix-client": "ios",
        },
      });
      assert(
        finDel.status === 403,
        `finance must be blocked from deleting receipt (got ${finDel.status})`,
      );
      console.log(
        `✓ Finance Approver correctly blocked from DELETE /receipts/:id (403)`,
      );
      // Admin should also be blocked (no admin bypass on edit operations).
      const admDel = await fetch(`${BASE}/receipts/${targetReceipt.id}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "x-healthtrix-client": "ios",
        },
      });
      assert(
        admDel.status === 403,
        `admin must be blocked from deleting receipt (got ${admDel.status})`,
      );
      console.log(
        `✓ System Admin correctly blocked from DELETE /receipts/:id (403)`,
      );
      // Owner can delete — and an audit entry must show up.
      const ownerDel = await fetch(`${BASE}/receipts/${targetReceipt.id}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${empToken}`,
          "x-healthtrix-client": "ios",
        },
      });
      assert(
        ownerDel.status === 204,
        `owner receipt delete must succeed (got ${ownerDel.status})`,
      );
      const tl3 = (await getJson(
        `/reports/${receiptHostReportId}/timeline`,
        empToken,
      )) as Array<{
        kind: string;
        content?: {
          action: string;
          entityType: string;
          entityId: string;
        } | null;
      }>;
      const recDel = tl3.find(
        (e) =>
          e.kind === "content" &&
          e.content?.entityType === "receipt" &&
          e.content?.entityId === targetReceipt!.id &&
          e.content?.action === "deleted",
      );
      assert(
        recDel,
        "receipt delete must produce a content audit entry on the timeline",
      );
      console.log(
        `✓ owner receipt delete recorded as content audit entry`,
      );
    } else {
      console.log(
        `⚠ no receipts on the test report — skipping receipt-delete checks`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Task #35 — seeded transactional emptiness, activate/deactivate flow,
  // backup zip, round-trip restore, wrong-org rejection, v1 fixture.
  //
  // These are the LAST tests because the v1 fixture restore wipes the
  // org and replaces it with a fixture-only payload (different admin
  // password etc.) — nothing in the smoke can run after that.
  // ─────────────────────────────────────────────────────────────────────
  await runBackupRestoreSmoke({
    sysadminToken: sessions["admin@healthtrix.test"].token,
    sysadminId: sessions["admin@healthtrix.test"].userId,
    employeeToken: sessions["priya@healthtrix.test"].token,
    employeeUserId: sessions["priya@healthtrix.test"].userId,
  });

  console.log("\nAll smoke checks passed.");
}

// ── Task #35 helpers ──────────────────────────────────────────────────────

type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
};

async function patchUser(
  id: string,
  body: Record<string, unknown>,
  token: string,
): Promise<Response> {
  return fetch(`${BASE}/admin/users/${id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-healthtrix-client": "ios",
    },
    body: JSON.stringify(body),
  });
}

async function listUsers(token: string): Promise<AdminUser[]> {
  return (await getJson("/admin/users", token)) as AdminUser[];
}

async function runBackupRestoreSmoke(args: {
  sysadminToken: string;
  sysadminId: string;
  employeeToken: string;
  employeeUserId: string;
}): Promise<void> {
  const { sysadminToken, sysadminId, employeeToken, employeeUserId } = args;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const JSZip = (await import("jszip")).default;

  // ── Seeded transactional emptiness ──────────────────────────────────
  const allReports = (await getJson(
    "/reports?scope=all",
    sysadminToken,
  )) as unknown[];
  assert(
    allReports.length === 0,
    `seed must not create any reports, got ${allReports.length}`,
  );
  console.log(`✓ seeded org has 0 expense reports`);

  const auditLog = (await getJson(
    "/admin/audit-log",
    sysadminToken,
  )) as unknown[];
  assert(
    auditLog.length === 0,
    `seed must not create audit entries, got ${auditLog.length}`,
  );
  console.log(`✓ seeded org has 0 audit entries`);

  // ── Activation flow via PATCH /admin/users/:id { isActive } ─────────
  const beforeUsers = await listUsers(sysadminToken);
  const seededCount = beforeUsers.length;
  assert(
    beforeUsers.every((u) => u.isActive === true),
    "every seeded user must be marked isActive: true",
  );
  console.log(`✓ all ${seededCount} seeded users are isActive=true`);

  const target = beforeUsers.find((u) => u.id === employeeUserId);
  assert(target, "smoke needs the employee user to exist");

  // Self-deactivate must be rejected.
  const selfRes = await patchUser(
    sysadminId,
    { isActive: false },
    sysadminToken,
  );
  assert(
    selfRes.status === 409,
    `self-deactivate must return 409, got ${selfRes.status}`,
  );
  console.log(`✓ sysadmin cannot deactivate themselves (409)`);

  // Deactivate the employee, then reactivate.
  const deactRes = await patchUser(
    target!.id,
    { isActive: false },
    sysadminToken,
  );
  assert(
    deactRes.status === 200,
    `deactivate failed: ${deactRes.status} ${await deactRes.text()}`,
  );
  const afterDeact = await listUsers(sysadminToken);
  const afterDeactRow = afterDeact.find((u) => u.id === target!.id)!;
  assert(
    afterDeactRow.isActive === false,
    `employee should be inactive after PATCH isActive:false`,
  );
  console.log(`✓ PATCH /admin/users isActive=false flips the row to inactive`);

  const reactRes = await patchUser(
    target!.id,
    { isActive: true },
    sysadminToken,
  );
  assert(
    reactRes.status === 200,
    `reactivate failed: ${reactRes.status} ${await reactRes.text()}`,
  );
  const afterReact = await listUsers(sysadminToken);
  const afterReactRow = afterReact.find((u) => u.id === target!.id)!;
  assert(
    afterReactRow.isActive === true,
    `employee should be active after PATCH isActive:true`,
  );
  console.log(`✓ PATCH /admin/users isActive=true reactivates the row`);

  // Non-sysadmin cannot hit the toggle.
  const empPatch = await patchUser(
    target!.id,
    { isActive: false },
    employeeToken,
  );
  assert(
    empPatch.status === 403,
    `employee patching users must be 403, got ${empPatch.status}`,
  );
  console.log(`✓ non-sysadmin blocked from PATCH /admin/users (403)`);

  // ── Backup zip headers + content ────────────────────────────────────
  const backupRes = await fetch(`${BASE}/admin/backup`, {
    headers: {
      authorization: `Bearer ${sysadminToken}`,
      "x-healthtrix-client": "ios",
    },
  });
  assert(
    backupRes.status === 200,
    `GET /admin/backup must be 200, got ${backupRes.status}`,
  );
  const backupCt = backupRes.headers.get("content-type") ?? "";
  assert(
    backupCt.startsWith("application/zip"),
    `backup must be application/zip, got ${backupCt}`,
  );
  const backupSchemaHeader = backupRes.headers.get("x-backup-schema-version");
  const backupOrgHeader = backupRes.headers.get("x-backup-org-id");
  const backupAppHeader = backupRes.headers.get("x-backup-app-version");
  assert(
    backupSchemaHeader === "1",
    `X-Backup-SchemaVersion must be "1", got ${backupSchemaHeader}`,
  );
  assert(
    backupOrgHeader && backupOrgHeader.length > 0,
    `X-Backup-OrgId must be present`,
  );
  assert(
    backupAppHeader && backupAppHeader.length > 0,
    `X-Backup-AppVersion must be present`,
  );
  console.log(
    `✓ backup zip headers ok (schema=${backupSchemaHeader}, org=${backupOrgHeader?.slice(0, 8)}…, app=${backupAppHeader})`,
  );

  const backupBuf = Buffer.from(await backupRes.arrayBuffer());
  const backupZip = await JSZip.loadAsync(backupBuf);
  const backupManifestRaw = await backupZip
    .file("manifest.json")!
    .async("string");
  const backupPayloadRaw = await backupZip
    .file("payload.json")!
    .async("string");
  const backupManifest = JSON.parse(backupManifestRaw) as {
    backupSchemaVersion: number;
    orgId: string;
    rowCounts: Record<string, number>;
  };
  assert(
    backupManifest.backupSchemaVersion === 1,
    `backup manifest schema version must be 1, got ${backupManifest.backupSchemaVersion}`,
  );
  assert(
    backupManifest.rowCounts.users === seededCount,
    `manifest users count (${backupManifest.rowCounts.users}) must match seeded users (${seededCount})`,
  );
  console.log(
    `✓ backup zip contains manifest + payload with users=${backupManifest.rowCounts.users}`,
  );

  // ── Wrong-org rejection ─────────────────────────────────────────────
  const wrongManifest = {
    ...backupManifest,
    orgId: "00000000-0000-4000-8000-000000000000",
  };
  const wrongPayload = JSON.parse(backupPayloadRaw) as { org: { id: string } };
  wrongPayload.org.id = "00000000-0000-4000-8000-000000000000";
  const wrongZip = new JSZip();
  wrongZip.file("manifest.json", JSON.stringify(wrongManifest));
  wrongZip.file("payload.json", JSON.stringify(wrongPayload));
  const wrongBuf = await wrongZip.generateAsync({ type: "nodebuffer" });
  const wrongRes = await postBackupZip(
    `${BASE}/admin/restore`,
    sysadminToken,
    "wrong-org.zip",
    wrongBuf,
    "RESTORE",
  );
  assert(
    wrongRes.status === 400 || wrongRes.status === 403,
    `wrong-org restore must be 4xx, got ${wrongRes.status}`,
  );
  console.log(
    `✓ wrong-org restore rejected (${wrongRes.status})`,
  );

  // Missing-confirm guard.
  const noConfirm = await postBackupZip(
    `${BASE}/admin/restore`,
    sysadminToken,
    "nope.zip",
    backupBuf,
    null,
  );
  assert(
    noConfirm.status === 400,
    `missing confirm must be 400, got ${noConfirm.status}`,
  );
  console.log(`✓ restore without confirm=RESTORE rejected (400)`);

  // ── Round-trip restore (replays the backup we just downloaded) ──────
  const roundTrip = await postBackupZip(
    `${BASE}/admin/restore`,
    sysadminToken,
    "round-trip.zip",
    backupBuf,
    "RESTORE",
  );
  const roundTripText = await roundTrip.text();
  assert(
    roundTrip.status === 200,
    `round-trip restore failed: ${roundTrip.status} ${roundTripText}`,
  );
  const roundTripBody = JSON.parse(roundTripText) as {
    rowCountsRestored: Record<string, number>;
  };
  assert(
    roundTripBody.rowCountsRestored.users === seededCount,
    `round-trip should restore ${seededCount} users, got ${roundTripBody.rowCountsRestored.users}`,
  );
  // Restore wipes the org via CASCADE, which also deletes every session
  // row pointing at the old user ids — including ours. Re-login before
  // querying anything else so subsequent assertions don't 401.
  const reloginAdmin = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-healthtrix-client": "ios",
    },
    body: JSON.stringify({
      email: "admin@healthtrix.test",
      password: "Healthtrix!2026",
    }),
  });
  assert(
    reloginAdmin.status === 200,
    `re-login after round-trip restore must succeed (got ${reloginAdmin.status})`,
  );
  const reloggedAdmin = (await reloginAdmin.json()) as {
    sessionToken: string;
  };
  const newSysadminToken = reloggedAdmin.sessionToken;
  // Verify the seeded users are still queryable after round-trip.
  const usersAfter = await listUsers(newSysadminToken);
  assert(
    usersAfter.length === seededCount,
    `users-after-roundtrip should be ${seededCount}, got ${usersAfter.length}`,
  );
  console.log(
    `✓ round-trip restore preserved ${roundTripBody.rowCountsRestored.users} users (and admin can sign in again)`,
  );

  // ── Rollback integrity: a restore that fails mid-transaction must
  //    leave the org's rows exactly as they were ──────────────────────
  //
  // We mutate the freshly-downloaded backup so it round-trips up to the
  // employee_profiles insert, then violates a foreign key. The DB
  // transaction in applyRestore() must roll back the wipe-and-re-insert,
  // leaving the live org untouched. We assert the user count is the same
  // before and after, plus that admin can still sign in.
  const usersBeforeBadRestore = await listUsers(newSysadminToken);
  const sabotagedZip = await JSZip.loadAsync(backupBuf);
  const sabotagedPayloadText = await sabotagedZip
    .file("payload.json")!
    .async("string");
  const sabotagedPayload = JSON.parse(sabotagedPayloadText) as {
    employeeProfiles: Array<Record<string, unknown>>;
  };
  // Reference a userId that does not exist anywhere in the payload —
  // the FK insert into employee_profiles will fail and trip a rollback.
  sabotagedPayload.employeeProfiles = [
    ...sabotagedPayload.employeeProfiles,
    {
      userId: "00000000-0000-0000-0000-000000000bad",
      employeeNumber: "ROLLBACK-PROBE",
      jobTitle: "Should never land",
      hireDate: "2024-01-01",
      payCycle: "Bi-weekly",
      employmentType: "Full-time",
      payType: "Salary",
      compensationCurrency: "USD",
      annualSalary: "0",
      hourlyRate: null,
      ytdGross: "0",
      ytdTaxes: "0",
      ytdNet: "0",
      lastPayDate: null,
      nextPayDate: null,
      reimbursementMethodPreference: "Direct Deposit",
      ssnLast4: "0000",
      bankAccountMaskedJson: null,
      directDepositVerified: false,
      paystubAccessGranted: true,
      taxFormsAccessGranted: true,
      ptoBalanceHours: "0",
      ptoAccrualPolicy: null,
      stockGrantsCount: 0,
      profilePhotoUrl: null,
    },
  ];
  sabotagedZip.file(
    "payload.json",
    JSON.stringify(sabotagedPayload, null, 2),
  );
  const sabotagedBuf = await sabotagedZip.generateAsync({
    type: "nodebuffer",
  });
  const badRes = await postBackupZip(
    `${BASE}/admin/restore`,
    newSysadminToken,
    "rollback-probe.zip",
    sabotagedBuf,
    "RESTORE",
  );
  assert(
    badRes.status >= 400 && badRes.status < 600,
    `mid-restore failure must return an error (got ${badRes.status})`,
  );
  // The session token survives because the txn rolled back, so we can
  // reuse newSysadminToken without re-logging in.
  const usersAfterBadRestore = await listUsers(newSysadminToken);
  assert(
    usersAfterBadRestore.length === usersBeforeBadRestore.length,
    `rollback should preserve user count (was ${usersBeforeBadRestore.length}, now ${usersAfterBadRestore.length})`,
  );
  const sortedBefore = [...usersBeforeBadRestore]
    .map((u) => u.id)
    .sort()
    .join(",");
  const sortedAfter = [...usersAfterBadRestore]
    .map((u) => u.id)
    .sort()
    .join(",");
  assert(
    sortedBefore === sortedAfter,
    `rollback should preserve exact user ids (drift detected)`,
  );
  console.log(
    `✓ failed restore rolled back cleanly (${usersAfterBadRestore.length} users still present, session intact)`,
  );

  // ── v1 fixture restore (must come LAST — overwrites the org) ────────
  const fixturePath = new URL(
    "../../artifacts/api-server/src/services/backup/__test__/fixtures/v1.json",
    import.meta.url,
  );
  const fs = await import("node:fs/promises");
  const fixtureRaw = await fs.readFile(fixturePath, "utf8");
  const fixtureOrgId = backupManifest.orgId;
  const substituted = fixtureRaw.replaceAll("{{ORG_ID}}", fixtureOrgId);
  const fixture = JSON.parse(substituted) as {
    manifest: unknown;
    payload: unknown;
  };
  const fixtureZip = new JSZip();
  fixtureZip.file("manifest.json", JSON.stringify(fixture.manifest, null, 2));
  fixtureZip.file("payload.json", JSON.stringify(fixture.payload, null, 2));
  const fixtureBuf = await fixtureZip.generateAsync({ type: "nodebuffer" });
  const fixtureRes = await postBackupZip(
    `${BASE}/admin/restore`,
    newSysadminToken,
    "v1-fixture.zip",
    fixtureBuf,
    "RESTORE",
  );
  const fixtureText = await fixtureRes.text();
  assert(
    fixtureRes.status === 200,
    `v1 fixture restore failed: ${fixtureRes.status} ${fixtureText}`,
  );
  const fixtureBody = JSON.parse(fixtureText) as {
    rowCountsRestored: Record<string, number>;
  };
  assert(
    fixtureBody.rowCountsRestored.users === 1,
    `v1 fixture restores 1 user, got ${fixtureBody.rowCountsRestored.users}`,
  );
  assert(
    fixtureBody.rowCountsRestored.glMappings === 1,
    `v1 fixture restores 1 GL mapping, got ${fixtureBody.rowCountsRestored.glMappings}`,
  );
  console.log(
    `✓ v1 fixture restored (users=${fixtureBody.rowCountsRestored.users}, depts=${fixtureBody.rowCountsRestored.departments}, gl=${fixtureBody.rowCountsRestored.glMappings})`,
  );
  console.log(
    "  (org now contains only the fixture data — re-run `pnpm seed` to restore demo accounts.)",
  );
}

async function postBackupZip(
  url: string,
  token: string,
  filename: string,
  buf: Buffer,
  confirm: string | null,
): Promise<Response> {
  // Construct multipart/form-data manually so we don't drag in a separate
  // npm dep just for the smoke. Buffer-based bodies are accepted by
  // global fetch via Uint8Array.
  const boundary = `----healthtrix-smoke-${Date.now()}`;
  const parts: Buffer[] = [];
  const enc = (s: string) => Buffer.from(s, "utf8");
  parts.push(
    enc(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="backup"; filename="${filename}"\r\n` +
        `Content-Type: application/zip\r\n\r\n`,
    ),
  );
  parts.push(buf);
  parts.push(enc("\r\n"));
  if (confirm !== null) {
    parts.push(
      enc(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="confirm"\r\n\r\n${confirm}\r\n`,
      ),
    );
  }
  parts.push(enc(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  return fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-healthtrix-client": "ios",
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(body.length),
    },
    body: new Uint8Array(body),
  });
}

main().catch((err) => {
  console.error("\nSmoke FAILED:", err);
  process.exitCode = 1;
});
