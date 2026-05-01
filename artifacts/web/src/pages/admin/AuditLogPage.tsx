import React, { useState } from "react";
import {
  useAdminAuditLog,
  getAdminAuditLogQueryKey,
  type ChangeFeedItem,
  type AuditFieldDiff,
} from "@workspace/api-client-react";
import { formatDateTime } from "@/lib/format";
import { HtCard } from "@/components/brand/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

function rowKey(item: ChangeFeedItem, idx: number): string {
  if (item.kind === "approval" && item.approval) return `a-${item.approval.id}`;
  if (item.kind === "content" && item.content) return `c-${item.content.id}`;
  return `idx-${idx}`;
}

function actionLabel(item: ChangeFeedItem): React.ReactNode {
  if (item.kind === "approval" && item.approval) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-800 border border-blue-100">
        {item.approval.fromStatus} → {item.approval.toStatus}
      </span>
    );
  }
  if (item.kind === "content" && item.content) {
    const verbColors: Record<string, string> = {
      created: "bg-emerald-50 text-emerald-800 border-emerald-100",
      updated: "bg-amber-50 text-amber-800 border-amber-100",
      deleted: "bg-red-50 text-red-800 border-red-100",
    };
    const color =
      verbColors[item.content.action] ?? "bg-gray-50 text-gray-800 border-gray-100";
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${color}`}
      >
        {item.content.action}
      </span>
    );
  }
  return null;
}

function entityLabel(item: ChangeFeedItem): string {
  if (item.kind === "approval" && item.approval) {
    return `Expense Report (${item.approval.reportId.slice(0, 8)}…)`;
  }
  if (item.kind === "content" && item.content) {
    const e = ENTITY_LABELS[item.content.entityType] ?? item.content.entityType;
    return `${e} on Report (${item.content.reportId.slice(0, 8)}…)`;
  }
  return "—";
}

function actorName(item: ChangeFeedItem): string {
  if (item.kind === "approval") return item.approval?.actor?.fullName ?? "—";
  return item.content?.actor?.fullName ?? "—";
}

function FieldDiffList({ diffs }: { diffs: AuditFieldDiff[] }) {
  if (diffs.length === 0) {
    return (
      <div className="text-xs text-[var(--ht-ink-3)]">
        No field changes recorded.
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {diffs.map((d, i) => (
        <li
          key={`${d.field}-${i}`}
          className="text-xs text-[var(--ht-ink-2)] bg-white rounded border border-[var(--ht-border)] px-2 py-1"
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

function DetailPanel({ item }: { item: ChangeFeedItem }) {
  if (item.kind === "approval" && item.approval) {
    return (
      <div className="space-y-2 text-sm">
        <div className="text-xs text-[var(--ht-ink-3)]">
          Roles:{" "}
          {item.approval.actorRoles?.length
            ? item.approval.actorRoles.join(", ")
            : "—"}
        </div>
        {item.approval.comment ? (
          <div className="bg-white border border-[var(--ht-border)] rounded p-2 text-[var(--ht-ink-2)]">
            {item.approval.comment}
          </div>
        ) : (
          <div className="text-xs text-[var(--ht-ink-3)]">No comment.</div>
        )}
      </div>
    );
  }
  if (item.kind === "content" && item.content) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-[var(--ht-ink-3)]">
          Roles:{" "}
          {item.content.actorRoles?.length
            ? item.content.actorRoles.join(", ")
            : "—"}{" "}
          • Entity ID: <span className="font-mono">{item.content.entityId}</span>
        </div>
        <FieldDiffList diffs={item.content.fieldDiffs} />
      </div>
    );
  }
  return null;
}

export function AuditLogPage() {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const { data: logs = [], isLoading } = useAdminAuditLog(
    {},
    { query: { queryKey: getAdminAuditLogQueryKey() } },
  );

  return (
    <div className="space-y-6" data-testid="page-auditlog">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            Audit Log
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Workflow approvals and field-level edits across every report.
          </p>
        </div>
      </div>

      <HtCard>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
            Loading audit logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--ht-ink-3)]">
            No logs found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log, idx) => {
                const key = rowKey(log, idx);
                const isExpanded = expandedKey === key;
                return (
                  <React.Fragment key={key}>
                    <TableRow
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedKey(isExpanded ? null : key)}
                      data-testid={`audit-row-${log.kind}`}
                    >
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {actorName(log)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                            log.kind === "approval"
                              ? "bg-blue-50 text-blue-800 border-blue-100"
                              : "bg-amber-50 text-amber-800 border-amber-100"
                          }`}
                        >
                          {log.kind === "approval" ? "Approval" : "Edit"}
                        </span>
                      </TableCell>
                      <TableCell>{actionLabel(log)}</TableCell>
                      <TableCell className="text-[var(--ht-ink-2)] text-sm">
                        {entityLabel(log)}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-gray-50 p-4">
                          <DetailPanel item={log} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </HtCard>
    </div>
  );
}
