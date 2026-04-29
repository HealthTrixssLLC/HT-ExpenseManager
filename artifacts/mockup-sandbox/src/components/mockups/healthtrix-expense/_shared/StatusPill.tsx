import type { WorkflowStatus } from "./types";

const TINTS: Record<WorkflowStatus, { bg: string; fg: string; dot: string }> = {
  "Draft":                       { bg: "var(--ht-tint-grey)",   fg: "#3F4A5C", dot: "var(--ht-light-grey)" },
  "Submitted":                   { bg: "var(--ht-tint-navy)",   fg: "var(--ht-navy)",  dot: "var(--ht-navy)" },
  "Manager Review":              { bg: "var(--ht-tint-teal)",   fg: "var(--ht-teal)",  dot: "var(--ht-teal)" },
  "Changes Requested":           { bg: "var(--ht-tint-orange)", fg: "#8A4F00",        dot: "var(--ht-orange)" },
  "Manager Approved":            { bg: "var(--ht-tint-green)",  fg: "#34604F",        dot: "var(--ht-light-green)" },
  "Finance Review":              { bg: "var(--ht-tint-teal)",   fg: "var(--ht-teal)",  dot: "var(--ht-light-teal)" },
  "Finance Approved":            { bg: "var(--ht-tint-green)",  fg: "#2F6E55",        dot: "var(--ht-light-green)" },
  "Posted to QuickBooks":        { bg: "var(--ht-tint-tan)",    fg: "#7A5512",        dot: "var(--ht-tan)" },
  "Ready for Payroll Reimbursement": { bg: "var(--ht-tint-orange)", fg: "#8A4F00",   dot: "var(--ht-light-orange)" },
  "Paid Through Payroll":        { bg: "var(--ht-tint-tan)",    fg: "#6F4F12",        dot: "var(--ht-orange)" },
  "Reconciled":                  { bg: "var(--ht-tint-success)", fg: "var(--ht-success)", dot: "var(--ht-success)" },
  "Rejected":                    { bg: "var(--ht-tint-danger)", fg: "var(--ht-danger)", dot: "var(--ht-danger)" },
  "Voided":                      { bg: "var(--ht-tint-grey)",   fg: "#5A6273",        dot: "var(--ht-light-grey)" },
  "Sync Error":                  { bg: "var(--ht-tint-danger)", fg: "var(--ht-danger)", dot: "var(--ht-danger)" },
};

export function StatusPill({
  status,
  size = "sm",
}: {
  status: WorkflowStatus;
  size?: "xs" | "sm" | "md";
}) {
  const t = TINTS[status];
  const padding = size === "xs" ? "2px 8px" : size === "md" ? "6px 12px" : "4px 10px";
  const fontSize = size === "xs" ? 11 : size === "md" ? 13 : 12;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: t.bg,
        color: t.fg,
        padding,
        borderRadius: 999,
        fontSize,
        fontWeight: 600,
        letterSpacing: 0.1,
        whiteSpace: "nowrap",
        lineHeight: 1.1,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: t.dot,
          flexShrink: 0,
        }}
      />
      {status}
    </span>
  );
}
