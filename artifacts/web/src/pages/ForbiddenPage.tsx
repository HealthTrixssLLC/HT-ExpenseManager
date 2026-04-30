import { Link } from "wouter";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function ForbiddenPage() {
  const { role } = useAuth();
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        padding: 48,
        minHeight: "60vh",
      }}
    >
      <div
        data-testid="forbidden-page"
        style={{
          maxWidth: 460,
          textAlign: "center",
          background: "var(--ht-surface)",
          border: "1px solid var(--ht-border)",
          borderRadius: 16,
          padding: 32,
          boxShadow: "var(--ht-elev-1)",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "var(--ht-tint-orange)",
            color: "var(--ht-orange)",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 16px",
          }}
        >
          <ShieldAlert size={28} />
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--ht-ink)" }}>
          You don't have access to that screen
        </h1>
        <p
          style={{
            margin: "10px 0 20px",
            fontSize: 13,
            color: "var(--ht-ink-3)",
            lineHeight: 1.55,
          }}
        >
          {role
            ? `Your role (${role}) doesn't include this area. If you believe this is a mistake, ask a System Admin to update your permissions.`
            : "Your role doesn't include this area."}
        </p>
        <Link
          href="/"
          data-testid="link-back-home"
          style={{
            display: "inline-block",
            background: "var(--ht-navy)",
            color: "white",
            textDecoration: "none",
            padding: "10px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
