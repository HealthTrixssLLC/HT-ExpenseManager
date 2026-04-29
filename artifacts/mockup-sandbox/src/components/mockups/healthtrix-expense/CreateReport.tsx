import { MobileShell } from "./_shared/Shells";
import { DEPARTMENTS } from "./_shared/data";
import { ChevronLeft } from "lucide-react";

export function CreateReport() {
  return (
    <MobileShell>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--ht-canvas)" }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", background: "var(--ht-surface)", borderBottom: "1px solid var(--ht-border)", display: "flex", alignItems: "center", gap: 16 }}>
          <ChevronLeft size={24} color="var(--ht-navy)" />
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--ht-ink)", margin: 0 }}>New expense report</h1>
            <div style={{ fontSize: 13, color: "var(--ht-ink-3)", fontWeight: 500 }}>Step 1 of 2</div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Report Title</label>
              <input
                type="text"
                defaultValue="HIMSS 2026 Conference — Las Vegas"
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 8,
                  border: "1px solid var(--ht-border-strong)",
                  fontSize: 15,
                  background: "var(--ht-surface)",
                  color: "var(--ht-ink)",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Department</label>
              <select
                defaultValue="Clinical Operations"
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 8,
                  border: "1px solid var(--ht-border-strong)",
                  fontSize: 15,
                  background: "var(--ht-surface)",
                  color: "var(--ht-ink)",
                  appearance: "none",
                }}
              >
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Period Start Date</label>
                <input
                  type="text"
                  defaultValue="Apr 14, 2026"
                  style={{
                    height: 48,
                    padding: "0 16px",
                    borderRadius: 8,
                    border: "1px solid var(--ht-border-strong)",
                    fontSize: 15,
                    background: "var(--ht-surface)",
                    color: "var(--ht-ink)",
                  }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Period End Date</label>
                <input
                  type="text"
                  defaultValue="Apr 18, 2026"
                  style={{
                    height: 48,
                    padding: "0 16px",
                    borderRadius: 8,
                    border: "1px solid var(--ht-border-strong)",
                    fontSize: 15,
                    background: "var(--ht-surface)",
                    color: "var(--ht-ink)",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Business Purpose</label>
              <textarea
                defaultValue="Attending HIMSS 2026 to evaluate clinical workflow vendors. Meeting with 3 prospective enterprise customers to discuss integration partnerships."
                style={{
                  height: 120,
                  padding: "16px",
                  borderRadius: 8,
                  border: "1px solid var(--ht-border-strong)",
                  fontSize: 15,
                  background: "var(--ht-surface)",
                  color: "var(--ht-ink)",
                  resize: "none",
                  fontFamily: "inherit",
                  lineHeight: 1.5,
                }}
              />
            </div>

          </div>
        </div>

        {/* Sticky Action Bar */}
        <div style={{ padding: "16px 20px 32px", background: "var(--ht-surface)", borderTop: "1px solid var(--ht-border)", display: "flex", gap: 12 }}>
          <button
            style={{
              flex: 1,
              height: 52,
              background: "var(--ht-surface)",
              color: "var(--ht-ink)",
              border: "1px solid var(--ht-border-strong)",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Save draft
          </button>
          <button
            style={{
              flex: 2,
              height: 52,
              background: "var(--ht-navy)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Continue · Add line items
          </button>
        </div>
      </div>
    </MobileShell>
  );
}
