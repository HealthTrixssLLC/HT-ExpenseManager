import type { CSSProperties, ReactNode } from "react";

export function HtCard({
  children,
  style,
  pad = 18,
}: {
  children: ReactNode;
  style?: CSSProperties;
  pad?: number;
}) {
  return (
    <div
      style={{
        background: "var(--ht-surface)",
        border: "1px solid var(--ht-border)",
        borderRadius: 14,
        boxShadow: "var(--ht-elev-1)",
        padding: pad,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function HtCardHeader({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 14,
      }}
    >
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ht-ink)" }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 12, color: "var(--ht-ink-3)", marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}

export function HtSection({
  title,
  children,
  right,
  style,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12, ...style }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: "var(--ht-ink)",
            letterSpacing: -0.2,
          }}
        >
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}
