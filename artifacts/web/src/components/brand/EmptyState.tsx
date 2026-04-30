import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      data-testid="empty-state"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "48px 24px",
        textAlign: "center",
        background: "var(--ht-surface)",
        border: "1px dashed var(--ht-border)",
        borderRadius: 14,
        color: "var(--ht-ink-2)",
      }}
    >
      {icon && (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "var(--ht-tint-navy)",
            color: "var(--ht-navy)",
            display: "grid",
            placeItems: "center",
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ht-ink)" }}>{title}</div>
      {description && (
        <div style={{ fontSize: 13, color: "var(--ht-ink-3)", maxWidth: 420 }}>
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
