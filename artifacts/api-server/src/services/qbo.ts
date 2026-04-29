import { customAlphabet } from "nanoid";
import { and, eq } from "drizzle-orm";
import {
  db,
  expenseReportsTable,
  glMappingsTable,
  lineItemsTable,
  qboPostingEventsTable,
  type ExpenseReport,
} from "@workspace/db";

const NANOID = customAlphabet("0123456789ABCDEFGHJKMNPQRSTVWXYZ", 8);

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

  // Group debits by GL account so the journal entry has one debit per account.
  const debitsByAccount = new Map<string, { category: string; cents: number }>();
  let totalCents = 0;
  for (const line of lines) {
    const account =
      accountByCategory.get(line.category) ?? FALLBACK_ACCOUNT;
    const cents = Math.round(parseFloat(line.amount) * 100);
    totalCents += cents;
    const existing = debitsByAccount.get(account);
    if (existing) {
      existing.cents += cents;
    } else {
      debitsByAccount.set(account, { category: line.category, cents });
    }
  }

  const debits: GlPreviewLine[] = [...debitsByAccount.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([account, { category, cents }]) => ({
      account,
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

  // Deterministic-ish failure: hash the report id and fail when it matches a
  // narrow window. This stays the same across retries unless forceSuccess.
  const shouldFail = !options.forceSuccess && hashFailureBucket(report.id) === 0;
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
