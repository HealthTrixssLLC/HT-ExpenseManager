/* eslint-disable no-console */
/**
 * Unit tests for the JournalEntry payload validator used by the
 * /reports/:id/gl-entry-validation endpoint.
 *
 * Run with: pnpm --filter @workspace/api-server run test:gl-entry-validation
 *
 * These exercises run entirely in-memory against
 * validateJournalEntryPayload — no DB or network. They cover each rule
 * the validator enforces (and that postReportToQboReal also enforces),
 * which is the contract the modal surfaces to admins:
 *   1. lines-present       — at least one Debit + one Credit line
 *   2. balanced            — sum(Debit) == sum(Credit)
 *   3. account-ref         — every line has AccountRef.value, no fallback
 *   4. ap-ar-entity        — A/P or A/R lines carry an Entity reference
 *   5. memo-present        — PrivateNote within Intuit's 4000-char limit
 *   6. journal-date        — TxnDate is a valid ISO date
 *   7. currency            — CurrencyRef.value is set
 */
import assert from "node:assert/strict";

const {
  validateJournalEntryPayload,
  extractValidationLines,
  QBO_PRIVATE_NOTE_MAX_LENGTH,
} = await import("../src/services/qbo.ts");

type Status = "pass" | "warn" | "fail";

function checkStatus(
  result: ReturnType<typeof validateJournalEntryPayload>,
  id: string,
): Status {
  const c = result.checks.find((x) => x.id === id);
  if (!c) throw new Error(`Missing check ${id}`);
  return c.status;
}

function buildPayload(overrides: {
  lines?: unknown[];
  privateNote?: string;
  txnDate?: string | null;
  currency?: string | null;
}): Record<string, unknown> {
  const je: Record<string, unknown> = {
    TxnDate: overrides.txnDate === undefined ? "2026-05-01" : overrides.txnDate,
    PrivateNote:
      overrides.privateNote === undefined ? "RPT-001" : overrides.privateNote,
    Line: overrides.lines ?? defaultLines(),
  };
  if (overrides.currency !== null) {
    je["CurrencyRef"] = { value: overrides.currency ?? "USD" };
  }
  // strip nulls
  if (overrides.txnDate === null) delete je["TxnDate"];
  if (overrides.privateNote === null) delete je["PrivateNote"];
  return { JournalEntry: je };
}

function defaultLines(): unknown[] {
  return [
    {
      Amount: 100,
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: "Debit",
        AccountRef: { value: "42", name: "Travel" },
      },
    },
    {
      Amount: 100,
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: "Credit",
        AccountRef: { value: "9", name: "Accounts Payable" },
        Entity: {
          Type: "Vendor",
          EntityRef: { value: "v-7", name: "Jane Employee" },
        },
      },
    },
  ];
}

console.log("→ happy path: balanced JE with AccountRefs + Vendor on A/P");
{
  const payload = buildPayload({});
  const accountTypes = new Map<string, string | null>([
    ["42", "Expense"],
    ["9", "Accounts Payable"],
  ]);
  const result = validateJournalEntryPayload(payload, accountTypes);
  assert.equal(result.balanced, true);
  assert.equal(result.totalDebits, "100.00");
  assert.equal(result.totalCredits, "100.00");
  assert.equal(checkStatus(result, "lines-present"), "pass");
  assert.equal(checkStatus(result, "balanced"), "pass");
  assert.equal(checkStatus(result, "account-ref"), "pass");
  assert.equal(checkStatus(result, "ap-ar-entity"), "pass");
  assert.equal(checkStatus(result, "memo-present"), "pass");
  assert.equal(checkStatus(result, "journal-date"), "pass");
  assert.equal(checkStatus(result, "currency"), "pass");
}

console.log("→ unbalanced JE fails the `balanced` check");
{
  const lines = defaultLines();
  // Tip the credit side to 80 so the JE is unbalanced.
  (lines[1] as { Amount: number }).Amount = 80;
  const result = validateJournalEntryPayload(buildPayload({ lines }));
  assert.equal(result.balanced, false);
  assert.equal(checkStatus(result, "balanced"), "fail");
}

console.log("→ missing AccountRef.value (fallback account) fails account-ref");
{
  const lines = defaultLines();
  // Drop AccountRef.value on the Debit line, mimicking the legacy
  // 'Uncategorized' fallback — Intuit rejects this even when a name
  // is present, since matching is by Id.
  const detail = (lines[0] as { JournalEntryLineDetail: Record<string, unknown> })
    .JournalEntryLineDetail;
  detail["AccountRef"] = { name: "Uncategorized" };
  const result = validateJournalEntryPayload(buildPayload({ lines }));
  assert.equal(checkStatus(result, "account-ref"), "fail");
}

console.log("→ A/P line without Entity fails ap-ar-entity (with type map)");
{
  const lines = defaultLines();
  // Strip the Entity off the A/P credit line.
  const detail = (lines[1] as { JournalEntryLineDetail: Record<string, unknown> })
    .JournalEntryLineDetail;
  delete detail["Entity"];
  const accountTypes = new Map<string, string | null>([
    ["42", "Expense"],
    ["9", "Accounts Payable"],
  ]);
  const result = validateJournalEntryPayload(buildPayload({ lines }), accountTypes);
  assert.equal(checkStatus(result, "ap-ar-entity"), "fail");
}

console.log(
  "→ A/P line without Entity warns (not fails) when account types are unknown",
);
{
  const lines = defaultLines();
  const detail = (lines[1] as { JournalEntryLineDetail: Record<string, unknown> })
    .JournalEntryLineDetail;
  delete detail["Entity"];
  // No account type map provided — validator can't tell A/P from
  // anything else, so it downgrades to a warn (the poster will fill in
  // Entity at post time once it resolves AccountType from QBO).
  const result = validateJournalEntryPayload(buildPayload({ lines }));
  assert.equal(checkStatus(result, "ap-ar-entity"), "warn");
}

console.log("→ PrivateNote over 4000 chars fails memo-present");
{
  const result = validateJournalEntryPayload(
    buildPayload({ privateNote: "x".repeat(QBO_PRIVATE_NOTE_MAX_LENGTH + 1) }),
  );
  assert.equal(checkStatus(result, "memo-present"), "fail");
}

console.log("→ missing PrivateNote warns");
{
  const result = validateJournalEntryPayload(buildPayload({ privateNote: "" }));
  assert.equal(checkStatus(result, "memo-present"), "warn");
}

console.log("→ invalid TxnDate fails journal-date");
{
  const result = validateJournalEntryPayload(
    buildPayload({ txnDate: "not-a-date" }),
  );
  assert.equal(checkStatus(result, "journal-date"), "fail");
}

console.log("→ calendar-invalid TxnDate (Feb 30) fails journal-date");
{
  const result = validateJournalEntryPayload(
    buildPayload({ txnDate: "2025-02-30" }),
  );
  assert.equal(checkStatus(result, "journal-date"), "fail");
}

console.log("→ month=13 TxnDate fails journal-date");
{
  const result = validateJournalEntryPayload(
    buildPayload({ txnDate: "2025-13-01" }),
  );
  assert.equal(checkStatus(result, "journal-date"), "fail");
}

console.log("→ missing CurrencyRef fails currency");
{
  const result = validateJournalEntryPayload(buildPayload({ currency: null }));
  assert.equal(checkStatus(result, "currency"), "fail");
}

console.log("→ JE with no Debit lines fails lines-present");
{
  const lines = defaultLines().filter(
    (l) =>
      (l as { JournalEntryLineDetail: { PostingType: string } })
        .JournalEntryLineDetail.PostingType !== "Debit",
  );
  const result = validateJournalEntryPayload(buildPayload({ lines }));
  assert.equal(checkStatus(result, "lines-present"), "fail");
}

console.log("→ extractValidationLines tolerates malformed entries");
{
  const lines = extractValidationLines({
    JournalEntry: {
      Line: [
        null,
        { JournalEntryLineDetail: { PostingType: "Bogus" } },
        defaultLines()[0],
      ],
    },
  });
  // Only the well-formed Debit line should survive.
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.postingType, "Debit");
}

console.log("✔ all gl-entry-validation tests passed");
