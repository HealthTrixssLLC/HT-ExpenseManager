import { Link } from "wouter";
import { EulaContent } from "./EulaContent";

export function EulaPage() {
  return (
    <div
      style={{
        background: "var(--ht-canvas)",
        padding: "8px 4px 32px",
      }}
    >
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          background: "var(--ht-surface)",
          border: "1px solid var(--ht-border)",
          borderRadius: 14,
          padding: "32px 36px",
          boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <Link
            href="/"
            data-testid="link-eula-back"
            style={{
              fontSize: 13,
              color: "var(--ht-navy)",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            ← Back
          </Link>
        </div>
        <EulaContent />
      </div>
    </div>
  );
}
