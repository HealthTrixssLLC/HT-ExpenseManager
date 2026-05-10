import { useState } from "react";
import { Link } from "wouter";
import { EULA_PRODUCT_NAME, EULA_SHORT_LABEL, EULA_VERSION } from "@workspace/legal";
import { EulaModal } from "./EulaModal";

export function AppFooter() {
  const [open, setOpen] = useState(false);
  const year = new Date().getFullYear();
  return (
    <footer
      data-testid="app-footer"
      style={{
        borderTop: "1px solid var(--ht-border)",
        background: "var(--ht-surface)",
        padding: "10px 24px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        fontSize: 11.5,
        color: "var(--ht-ink-3)",
      }}
    >
      <span>
        © {year} {EULA_PRODUCT_NAME} · v{EULA_VERSION}
      </span>
      <span style={{ display: "inline-flex", gap: 14 }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="footer-eula-button"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            color: "var(--ht-navy)",
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {EULA_SHORT_LABEL}
        </button>
        <Link
          href="/legal/eula"
          data-testid="footer-eula-link"
          style={{
            color: "var(--ht-ink-3)",
            textDecoration: "none",
          }}
        >
          Open page
        </Link>
      </span>
      {open && <EulaModal onClose={() => setOpen(false)} />}
    </footer>
  );
}
