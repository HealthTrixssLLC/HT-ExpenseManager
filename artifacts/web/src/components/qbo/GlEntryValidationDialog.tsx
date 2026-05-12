import { useMemo, useState } from "react";
import {
  useGetGlEntryValidation,
  getGetGlEntryValidationQueryKey,
  type GlEntryValidationResult,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  XCircle,
} from "lucide-react";
import { notifySuccess } from "@/lib/notify";

type Props = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  reportId: string | null;
  /** Optional posting event id — when set, the persisted payload from
   * `qbo_posting_events` is validated; otherwise the payload is rebuilt
   * live via buildGlPreview + buildJournalEntryPayload. */
  postingEventId?: string | null;
  /** Display label for the report (header text only). */
  reportLabel?: string | null;
};

function StatusIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") {
    return (
      <CheckCircle2
        className="mt-0.5 h-4 w-4 shrink-0 text-green-600"
        aria-label="Pass"
      />
    );
  }
  if (status === "warn") {
    return (
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
        aria-label="Warning"
      />
    );
  }
  return (
    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Fail" />
  );
}

function formatAmount(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Reusable modal that fetches and renders the JournalEntry payload that
 * Healthtrix would (or did) POST to Intuit's /v3/company/{realmId}/journalentry
 * endpoint, alongside a checklist validating it against Intuit's API
 * rules. Used from the QBO admin Posting History panel and from the
 * Payroll Queue + Batches tabs.
 */
export function GlEntryValidationDialog({
  open,
  onOpenChange,
  reportId,
  postingEventId,
  reportLabel,
}: Props) {
  const enabled = open && Boolean(reportId);
  const params = useMemo(
    () => (postingEventId ? { postingEventId } : undefined),
    [postingEventId],
  );
  const { data, isLoading, error } = useGetGlEntryValidation(
    reportId ?? "",
    params,
    {
      query: {
        enabled,
        queryKey: getGetGlEntryValidationQueryKey(reportId ?? "", params),
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Validate GL entry</DialogTitle>
          <DialogDescription>
            Checks the JournalEntry payload Healthtrix would post to Intuit
            against QuickBooks' API rules.
            {reportLabel ? (
              <span className="ml-1 font-mono text-xs">{reportLabel}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {!enabled ? null : isLoading ? (
          <div className="py-10 text-center text-sm text-[var(--ht-ink-3)]">
            Loading…
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            Failed to load validation:{" "}
            {error instanceof Error ? error.message : "Unknown error"}
          </div>
        ) : data ? (
          <DialogBody result={data} />
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogBody({ result }: { result: GlEntryValidationResult }) {
  const [showRaw, setShowRaw] = useState(false);
  const rawJson = useMemo(
    () => JSON.stringify(result.rawPayload, null, 2),
    [result.rawPayload],
  );

  const copyRaw = async () => {
    try {
      await navigator.clipboard.writeText(rawJson);
      notifySuccess("Copied", "JournalEntry payload copied to clipboard.");
    } catch {
      // Clipboard API may be blocked (older browsers, insecure context); the
      // raw textarea below is selectable as a fallback.
    }
  };

  const failCount = result.checks.filter((c) => c.status === "fail").length;
  const warnCount = result.checks.filter((c) => c.status === "warn").length;
  const overall: "pass" | "warn" | "fail" =
    failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-md border border-[var(--ht-border)] p-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
          <Header label="Report" value={result.reportDisplayCode} mono />
          <Header label="Source" value={
            result.source === "posting_event"
              ? "Stored posting event"
              : "Live build (next post)"
          } />
          <Header label="Environment" value={result.environment} />
          <Header label="Realm" value={result.realmId ?? "—"} mono />
          <Header label="Date" value={result.journalDate || "—"} />
          <Header label="Currency" value={result.currency} />
          {result.journalId ? (
            <Header label="Journal Id" value={result.journalId} mono />
          ) : null}
          {result.qboJournalId ? (
            <Header label="QBO Journal" value={result.qboJournalId} mono />
          ) : null}
        </div>
        {result.memo ? (
          <div className="mt-2 text-xs">
            <span className="text-[var(--ht-ink-3)]">Memo: </span>
            <span className="whitespace-pre-wrap break-words">{result.memo}</span>
          </div>
        ) : (
          <div className="mt-2 text-xs text-[var(--ht-ink-3)]">
            Memo: <span className="italic">(none)</span>
          </div>
        )}
      </div>

      <div
        className={
          "rounded-md border p-3 " +
          (overall === "pass"
            ? "border-green-200 bg-green-50"
            : overall === "warn"
              ? "border-amber-200 bg-amber-50"
              : "border-red-200 bg-red-50")
        }
      >
        <div className="flex items-center gap-2 font-medium">
          <StatusIcon status={overall} />
          {overall === "pass"
            ? "Payload passes all Intuit JournalEntry rules."
            : overall === "warn"
              ? `${warnCount} warning${warnCount === 1 ? "" : "s"} — payload would post but review the notes below.`
              : `${failCount} blocking issue${failCount === 1 ? "" : "s"} — Intuit will reject this payload as-is.`}
        </div>
      </div>

      <ul className="space-y-2">
        {result.checks.map((c) => (
          <li
            key={c.id}
            className="flex items-start gap-2 rounded-md border border-[var(--ht-border)] p-3"
            data-testid={`gl-check-${c.id}`}
          >
            <StatusIcon status={c.status} />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[var(--ht-ink)]">{c.label}</div>
              {c.detail ? (
                <div className="mt-0.5 text-xs text-[var(--ht-ink-3)]">
                  {c.detail}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div>
        <h4 className="mb-2 text-sm font-medium text-[var(--ht-ink)]">Lines</h4>
        {result.lines.length === 0 ? (
          <div className="rounded-md border border-[var(--ht-border)] p-3 text-xs text-[var(--ht-ink-3)]">
            Payload contained no readable JournalEntry lines.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Account Type</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{l.postingType}</TableCell>
                  <TableCell className="text-xs">
                    <div>{l.account}</div>
                    {l.accountId ? (
                      <div className="font-mono text-[10px] text-[var(--ht-ink-3)]">
                        id {l.accountId}
                      </div>
                    ) : (
                      <div className="text-[10px] text-red-700">no AccountRef.value</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{l.accountType ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {l.entityRefValue ? (
                      <>
                        {l.entityType ?? "Entity"} · {l.entityRefName ?? l.entityRefValue}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatAmount(l.amount)}
                  </TableCell>
                </TableRow>
              ))}
              {/* Totals row mirrors what Intuit's JournalEntry endpoint
                  enforces — sum(Debit) must equal sum(Credit). Showing
                  it as the last row of the lines table makes the
                  balanced/unbalanced state obvious at a glance. */}
              <TableRow
                className="border-t-2 border-[var(--ht-border)] font-medium"
                data-testid="gl-lines-totals"
              >
                <TableCell className="text-xs">Totals</TableCell>
                <TableCell className="text-xs" colSpan={2}>
                  Debits {formatAmount(result.totalDebits)} · Credits{" "}
                  {formatAmount(result.totalCredits)}
                </TableCell>
                <TableCell className="text-xs">
                  {result.balanced ? (
                    <span className="text-green-700">Balanced</span>
                  ) : (
                    <span className="text-red-700">Unbalanced</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatAmount(
                    String(
                      Number(result.totalDebits) - Number(result.totalCredits),
                    ),
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </div>

      <div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-[var(--ht-accent)] hover:underline"
          onClick={() => setShowRaw((v) => !v)}
          data-testid="gl-toggle-raw-payload"
        >
          {showRaw ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {showRaw ? "Hide" : "Show"} raw JournalEntry payload
        </button>
        {showRaw ? (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={copyRaw}>
                <Copy className="mr-1 h-3 w-3" /> Copy
              </Button>
              <a
                href="https://developer.intuit.com/app/developer/qbapi/docs/api/accounting/journalentry"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[var(--ht-accent)] hover:underline"
              >
                Intuit JournalEntry docs <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <pre
              className="max-h-80 overflow-auto rounded-md border border-[var(--ht-border)] bg-[var(--ht-surface-2)] p-3 font-mono text-[11px] leading-relaxed"
              data-testid="gl-raw-payload"
            >
              {rawJson}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Header({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-[var(--ht-ink-3)]">{label}: </span>
      <span className={mono ? "font-mono" : undefined}>{value}</span>
    </div>
  );
}
