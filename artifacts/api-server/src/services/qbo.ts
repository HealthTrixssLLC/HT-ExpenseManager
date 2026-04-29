import { customAlphabet } from "nanoid";
import { and, eq } from "drizzle-orm";
import {
  db,
  expenseReportsTable,
  glMappingsTable,
  lineItemsTable,
  orgsTable,
  qboConnectionTable,
  qboPostingEventsTable,
  type ExpenseReport,
  type QboConnection,
} from "@workspace/db";

const NANOID = customAlphabet("0123456789ABCDEFGHJKMNPQRSTVWXYZ", 8);
const REALM_NANOID = customAlphabet("0123456789", 16);

const FALLBACK_ACCOUNT = "Uncategorized Expense";
const PAYABLE_ACCOUNT = "Employee Reimbursement Payable";
const CURRENCY = "USD";

export type GlPreview = {
  reportId: string;
  displayCode: string;
  journalDate: string;
  memo: string;
  debits: GlPreviewLine[];
  credits: GlPreviewLine[];
  totalDebits: string;
  totalCredits: string;
  currency: string;
};

export type GlPreviewLine = {
  account: string;
  category: string;
  amount: string;
};

function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, "0")}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function buildGlPreview(
  report: ExpenseReport,
): Promise<GlPreview> {
  const [lines, mappings] = await Promise.all([
    db
      .select()
      .from(lineItemsTable)
      .where(eq(lineItemsTable.reportId, report.id)),
    db
      .select()
      .from(glMappingsTable)
      .where(eq(glMappingsTable.orgId, report.orgId)),
  ]);

  const accountByCategory = new Map(
    mappings.map((m) => [m.code, m.qboAccount] as const),
  );

  // One debit line per CATEGORY total (not per account). If two categories
  // happen to map to the same QBO account, they remain distinct debit lines
  // in the GL preview — this preserves category-level fidelity for finance
  // review and downstream reconciliation. The category→account lookup happens
  // per category, so the journal entry still references the right account.
  const debitsByCategory = new Map<string, number>();
  let totalCents = 0;
  for (const line of lines) {
    const cents = Math.round(parseFloat(line.amount) * 100);
    totalCents += cents;
    debitsByCategory.set(
      line.category,
      (debitsByCategory.get(line.category) ?? 0) + cents,
    );
  }

  const debits: GlPreviewLine[] = [...debitsByCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, cents]) => ({
      account: accountByCategory.get(category) ?? FALLBACK_ACCOUNT,
      category,
      amount: centsToDecimal(cents),
    }));

  const credits: GlPreviewLine[] = [
    {
      account: PAYABLE_ACCOUNT,
      category: PAYABLE_ACCOUNT,
      amount: centsToDecimal(totalCents),
    },
  ];

  return {
    reportId: report.id,
    displayCode: report.displayCode,
    journalDate: todayIso(),
    memo: `Healthtrix Expense — ${report.displayCode} — ${report.title}`,
    debits,
    credits,
    totalDebits: centsToDecimal(totalCents),
    totalCredits: centsToDecimal(totalCents),
    currency: CURRENCY,
  };
}

export type StubPostResult =
  | {
      status: "posted";
      journalId: string;
      payload: Record<string, unknown>;
    }
  | {
      status: "error";
      errorMessage: string;
      payload: Record<string, unknown>;
    };

// Deterministic Intuit-shaped JournalEntry payload. Roughly 1-in-50 posts
// fail with a sync error, controlled by a tiny digest-based pseudo-random.
export async function postReportToQbo(
  report: ExpenseReport,
  options: { forceSuccess?: boolean } = {},
): Promise<StubPostResult> {
  const preview = await buildGlPreview(report);
  const journalId = `QBO-J-${NANOID()}`;
  const payload = {
    JournalEntry: {
      DocNumber: report.displayCode,
      TxnDate: preview.journalDate,
      PrivateNote: preview.memo,
      Line: [
        ...preview.debits.map((d, idx) => ({
          Id: String(idx + 1),
          Description: d.category,
          Amount: parseFloat(d.amount),
          DetailType: "JournalEntryLineDetail",
          JournalEntryLineDetail: {
            PostingType: "Debit",
            AccountRef: { name: d.account },
          },
        })),
        ...preview.credits.map((c, idx) => ({
          Id: String(preview.debits.length + idx + 1),
          Description: c.category,
          Amount: parseFloat(c.amount),
          DetailType: "JournalEntryLineDetail",
          JournalEntryLineDetail: {
            PostingType: "Credit",
            AccountRef: { name: c.account },
          },
        })),
      ],
      CurrencyRef: { value: preview.currency },
      TotalAmt: parseFloat(preview.totalDebits),
    },
  };

  // Stub QuickBooks sync errors are gated behind a feature flag so production
  // deploys never inject random failures. The default error rate is 0; demo /
  // dev environments can set QBO_STUB_SYNC_ERROR_RATE=0.02 to exercise the
  // retry path. The failure bucket is deterministic per (report) so retries
  // hit the same outcome unless `forceSuccess` is set.
  const errorRate = parseStubErrorRate(process.env["QBO_STUB_SYNC_ERROR_RATE"]);
  const failThreshold = Math.round(errorRate * 50);
  const shouldFail =
    !options.forceSuccess &&
    failThreshold > 0 &&
    hashFailureBucket(report.id) < failThreshold;
  if (shouldFail) {
    await db.insert(qboPostingEventsTable).values({
      orgId: report.orgId,
      reportId: report.id,
      journalId,
      payload,
      status: "error",
      errorMessage:
        "QuickBooks: Account 'Employee Reimbursement Payable' is inactive (stub)",
    });
    return {
      status: "error",
      errorMessage:
        "QuickBooks: Account 'Employee Reimbursement Payable' is inactive (stub)",
      payload,
    };
  }

  await db.insert(qboPostingEventsTable).values({
    orgId: report.orgId,
    reportId: report.id,
    journalId,
    payload,
    status: "posted",
  });
  return { status: "posted", journalId, payload };
}

function hashFailureBucket(s: string): number {
  let h = 0;
  for (const ch of s) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return h % 50;
}

function parseStubErrorRate(raw: string | undefined): number {
  if (!raw) return 0;
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(v, 1);
}

/**
 * Find or create the org's QuickBooks connection row, then mark it as
 * connected with a freshly-generated realm id and a sandbox-suffixed
 * company name. This is the stub equivalent of completing the Intuit
 * OAuth dance — we always return a "<org name> · Sandbox" string so it
 * is obvious in the UI that this is the stub connection, not a real
 * Intuit-issued company.
 */
export async function connectQboStub(orgId: string): Promise<QboConnection> {
  const [org] = await db
    .select({ name: orgsTable.name })
    .from(orgsTable)
    .where(eq(orgsTable.id, orgId))
    .limit(1);
  if (!org) {
    throw new Error(`Org ${orgId} not found while connecting QuickBooks stub`);
  }
  const realmId = REALM_NANOID();
  const companyName = `${org.name} · Sandbox`;
  await ensureConnectionRow(orgId);
  const [updated] = await db
    .update(qboConnectionTable)
    .set({
      status: "connected",
      realmId,
      companyName,
      connectedAt: new Date(),
      lastSyncError: null,
    })
    .where(eq(qboConnectionTable.orgId, orgId))
    .returning();
  return updated;
}

export async function disconnectQboStub(orgId: string): Promise<QboConnection> {
  await ensureConnectionRow(orgId);
  const [updated] = await db
    .update(qboConnectionTable)
    .set({
      status: "disconnected",
      realmId: null,
      companyName: null,
      connectedAt: null,
    })
    .where(eq(qboConnectionTable.orgId, orgId))
    .returning();
  return updated;
}

export async function ensureConnectionRow(orgId: string): Promise<QboConnection> {
  const existing = (
    await db
      .select()
      .from(qboConnectionTable)
      .where(eq(qboConnectionTable.orgId, orgId))
      .limit(1)
  )[0];
  if (existing) return existing;
  const [created] = await db
    .insert(qboConnectionTable)
    .values({ orgId })
    .returning();
  return created;
}

export async function loadLastPostingEvent(
  reportId: string,
): Promise<{ journalId: string | null; status: "posted" | "error" } | null> {
  const rows = await db
    .select()
    .from(qboPostingEventsTable)
    .where(eq(qboPostingEventsTable.reportId, reportId));
  if (rows.length === 0) return null;
  const last = rows.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
  return { journalId: last.journalId, status: last.status };
}

export async function pickReportForPosting(
  reportId: string,
  orgId: string,
): Promise<ExpenseReport | null> {
  const rows = await db
    .select()
    .from(expenseReportsTable)
    .where(
      and(
        eq(expenseReportsTable.id, reportId),
        eq(expenseReportsTable.orgId, orgId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function markLineItemsForReview(
  reportId: string,
  threshold: number,
): Promise<void> {
  const lines = await db
    .select()
    .from(lineItemsTable)
    .where(eq(lineItemsTable.reportId, reportId));
  for (const line of lines) {
    const amt = parseFloat(line.amount);
    const needs = amt >= threshold;
    if (needs !== line.needsReview) {
      await db
        .update(lineItemsTable)
        .set({ needsReview: needs })
        .where(eq(lineItemsTable.id, line.id));
    }
  }
}
