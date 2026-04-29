import type { ReactNode } from "react";

type NavItem = { label: string; icon: ReactNode; active?: boolean; badge?: number | string };

export function Sidebar({
  items,
  footer,
}: {
  items: NavItem[];
  footer?: ReactNode;
}) {
  return (
    <aside
      style={{
        width: 232,
        background: "var(--ht-surface-2)",
        borderRight: "1px solid var(--ht-border)",
        padding: "20px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 1.1, padding: "0 10px 8px" }}>
        Workspace
      </div>
      {items.map((it) => (
        <button
          key={it.label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 10px",
            background: it.active ? "var(--ht-tint-navy)" : "transparent",
            color: it.active ? "var(--ht-navy)" : "var(--ht-ink-2)",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: it.active ? 600 : 500,
            textAlign: "left",
            cursor: "pointer",
            position: "relative",
          }}
        >
          <span style={{ display: "inline-flex", color: it.active ? "var(--ht-navy)" : "var(--ht-ink-3)" }}>{it.icon}</span>
          <span style={{ flex: 1 }}>{it.label}</span>
          {it.badge != null && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                background: it.active ? "var(--ht-navy)" : "var(--ht-border-strong)",
                color: it.active ? "white" : "var(--ht-ink)",
                padding: "2px 7px",
                borderRadius: 999,
                minWidth: 18,
                textAlign: "center",
              }}
            >
              {it.badge}
            </span>
          )}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      {footer}
    </aside>
  );
}
