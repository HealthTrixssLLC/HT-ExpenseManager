import type { ReactNode } from "react";
import htLogoLight from "@/assets/ht_mark_light.png";
import htLogoDark from "@/assets/ht_mark_dark.png";
import { initialsOf } from "@/lib/format";

export function HealthtrixMark({
  size = 32,
  variant = "light",
}: {
  size?: number;
  /** "light" = mark intended for light backgrounds (small orange glyph),
   *  "dark"  = mark intended for navy chrome and the login splash. */
  variant?: "light" | "dark";
}) {
  const src = variant === "dark" ? htLogoDark : htLogoLight;
  const wordmarkColor =
    variant === "dark" ? "rgba(255,255,255,0.95)" : "var(--ht-navy)";
  const subtleColor =
    variant === "dark" ? "rgba(255,255,255,0.65)" : "var(--ht-ink-3)";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <img
        src={src}
        alt="Healthtrix"
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          display: "block",
          objectFit: "contain",
          flexShrink: 0,
          borderRadius: variant === "dark" ? 8 : 0,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: -0.2,
            color: wordmarkColor,
          }}
        >
          Healthtrix
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: 1.2,
            color: subtleColor,
            textTransform: "uppercase",
            marginTop: 3,
          }}
        >
          Expense
        </span>
      </div>
    </div>
  );
}

export function DesktopTopbar({
  user,
  roles,
  rightSlot,
  onSignOut,
}: {
  user: string;
  roles: readonly string[];
  rightSlot?: ReactNode;
  onSignOut?: () => void;
}) {
  return (
    <header
      style={{
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        background: "var(--ht-navy)",
        color: "white",
        borderBottom: "1px solid var(--ht-navy)",
      }}
    >
      <HealthtrixMark size={36} variant="dark" />
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {rightSlot}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            paddingLeft: 16,
            borderLeft: "1px solid rgba(255,255,255,0.18)",
          }}
        >
          <div style={{ textAlign: "right", lineHeight: 1.2 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>{user}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{roles.join(" · ")}</div>
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: "var(--ht-orange)",
              color: "var(--ht-navy)",
              display: "grid",
              placeItems: "center",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0.4,
            }}
          >
            {initialsOf(user)}
          </div>
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              data-testid="button-sign-out"
              style={{
                background: "transparent",
                color: "rgba(255,255,255,0.85)",
                border: "1px solid rgba(255,255,255,0.25)",
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
