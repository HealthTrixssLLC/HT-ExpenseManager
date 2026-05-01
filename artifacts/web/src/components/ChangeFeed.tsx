import type {
  ChangeFeedItem,
  AuditFieldDiff,
  AuditEntry,
  ApprovalAction,
} from "@workspace/api-client-react";
import { formatDateTime } from "@/lib/format";

type Props = {
  items: ChangeFeedItem[];
  emptyLabel?: string;
};

const ENTITY_LABELS: Record<string, string> = {
  report: "Report",
  line_item: "Line item",
  receipt: "Receipt",
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  policy: "Policy",
  departmentId: "Department",
  periodStart: "Period start",
  periodEnd: "Period end",
  merchant: "Merchant",
  category: "Category",
  amount: "Amount",
  currency: "Currency",
  occurredOn: "Date",
  paymentMethod: "Payment method",
  notes: "Notes",
  filename: "File name",
  objectPath: "Storage path",
  lineItemId: "Linked line item",
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function ActorChips({ roles }: { roles: string[] | undefined }) {
  if (!roles || roles.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1">
      {roles.map((r) => (
        <span
          key={r}
          className="inline-block px-1.5 py-px rounded bg-gray-100 text-[var(--ht-ink-2)] uppercase tracking-wide text-[10px]"
        >
          {r}
        </span>
      ))}
    </span>
  );
}

function FieldDiffList({ diffs }: { diffs: AuditFieldDiff[] }) {
  if (diffs.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {diffs.map((d, i) => (
        <li
          key={`${d.field}-${i}`}
          className="text-xs text-[var(--ht-ink-2)] bg-gray-50 rounded border border-[var(--ht-border)] px-2 py-1"
        >
          <span className="font-medium text-[var(--ht-ink)]">
            {fieldLabel(d.field)}:
          </span>{" "}
          <span className="text-red-600 line-through">
            {formatValue(d.before)}
          </span>{" "}
          →{" "}
          <span className="text-emerald-700 font-medium">
            {formatValue(d.after)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ApprovalRow({ a }: { a: ApprovalAction }) {
  return (
    <>
      <div className="font-medium text-[var(--ht-ink)]">
        {a.fromStatus} → {a.toStatus}
      </div>
      <div className="text-xs text-[var(--ht-ink-3)] mt-0.5">
        {a.actor?.fullName}
        <ActorChips roles={a.actorRoles} />
        <span className="mx-1">•</span>
        {formatDateTime(a.createdAt)}
      </div>
      {a.comment && (
        <div className="mt-1 text-sm text-[var(--ht-ink-2)] bg-gray-50 p-2 rounded border border-[var(--ht-border)]">
          {a.comment}
        </div>
      )}
    </>
  );
}

function ContentRow({ e }: { e: AuditEntry }) {
  const entity = ENTITY_LABELS[e.entityType] ?? e.entityType;
  let verb = "edited";
  if (e.action === "created") verb = "added";
  else if (e.action === "deleted") verb = "removed";
  return (
    <>
      <div className="font-medium text-[var(--ht-ink)]">
        {entity} {verb}
      </div>
      <div className="text-xs text-[var(--ht-ink-3)] mt-0.5">
        {e.actor?.fullName}
        <ActorChips roles={e.actorRoles} />
        <span className="mx-1">•</span>
        {formatDateTime(e.createdAt)}
      </div>
      <FieldDiffList diffs={e.fieldDiffs} />
    </>
  );
}

export function ChangeFeed({ items, emptyLabel = "No activity yet." }: Props) {
  if (items.length === 0) {
    return <div className="text-sm text-[var(--ht-ink-3)]">{emptyLabel}</div>;
  }
  return (
    <div className="space-y-4" data-testid="change-feed">
      {items.map((item, i) => {
        const isApproval = item.kind === "approval";
        const dotColor = isApproval ? "bg-[var(--ht-navy)]" : "bg-amber-500";
        return (
          <div
            key={
              (isApproval ? item.approval?.id : item.content?.id) ?? `idx-${i}`
            }
            className="flex gap-3 text-sm"
            data-kind={item.kind}
          >
            <div className="flex flex-col items-center">
              <div className={`w-2 h-2 rounded-full ${dotColor} mt-1.5`} />
              {i < items.length - 1 && (
                <div className="w-px h-full bg-[var(--ht-border)] mt-1 mb-1" />
              )}
            </div>
            <div className="pb-4 flex-1">
              {isApproval && item.approval && (
                <ApprovalRow a={item.approval} />
              )}
              {!isApproval && item.content && <ContentRow e={item.content} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
