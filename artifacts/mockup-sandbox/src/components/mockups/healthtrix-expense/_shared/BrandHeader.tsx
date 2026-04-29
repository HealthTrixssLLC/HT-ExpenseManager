export function HealthtrixMark({ size = 28 }: { size?: number }) {
  // Compact wordmark + caduceus-style ribbon mark, no third-party assets.
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden
      >
        <rect width="32" height="32" rx="8" fill="var(--ht-navy)" />
        <path
          d="M9 22 L13 10 L16 18 L19 10 L23 22"
          stroke="var(--ht-orange)"
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="16" cy="22.5" r="1.6" fill="var(--ht-tan)" />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2, color: "var(--ht-navy)" }}>
          Healthtrix
        </span>
        <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: 1.2, color: "var(--ht-ink-3)", textTransform: "uppercase", marginTop: 2 }}>
          Expense
        </span>
      </div>
    </div>
  );
}

export function DesktopTopbar({
  user,
  role,
  rightSlot,
}: {
  user: string;
  role: string;
  rightSlot?: React.ReactNode;
}) {
  const initials = user
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <header
      style={{
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        background: "var(--ht-surface)",
        borderBottom: "1px solid var(--ht-border)",
      }}
    >
      <HealthtrixMark size={32} />
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {rightSlot}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingLeft: 16,
            borderLeft: "1px solid var(--ht-border)",
          }}
        >
          <div style={{ textAlign: "right", lineHeight: 1.2 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ht-ink)" }}>{user}</div>
            <div style={{ fontSize: 11, color: "var(--ht-ink-3)" }}>{role}</div>
          </div>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              background: "var(--ht-navy)",
              color: "white",
              display: "grid",
              placeItems: "center",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.4,
            }}
          >
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
