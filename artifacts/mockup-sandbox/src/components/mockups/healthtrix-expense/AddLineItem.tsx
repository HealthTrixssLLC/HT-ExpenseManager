import { MobileShell } from "./_shared/Shells";
import { X, Camera } from "lucide-react";

export function AddLineItem() {
  return (
    <MobileShell>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--ht-surface)" }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ht-border)", display: "flex", alignItems: "center", gap: 16 }}>
          <X size={24} color="var(--ht-ink-2)" />
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--ht-ink)", margin: 0 }}>Add expense</h1>
            <div style={{ fontSize: 13, color: "var(--ht-ink-3)", fontWeight: 500 }}>EXP-2604-118</div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Date</label>
              <input
                type="text"
                defaultValue="Apr 15, 2026"
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 8,
                  border: "1px solid var(--ht-border-strong)",
                  fontSize: 15,
                  background: "var(--ht-canvas)",
                  color: "var(--ht-ink)",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Merchant</label>
              <input
                type="text"
                defaultValue="Jaleo Las Vegas"
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 8,
                  border: "1px solid var(--ht-border-strong)",
                  fontSize: 15,
                  background: "var(--ht-canvas)",
                  color: "var(--ht-ink)",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Description</label>
              <input
                type="text"
                defaultValue="Dinner with 3 prospective customers"
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 8,
                  border: "1px solid var(--ht-border-strong)",
                  fontSize: 15,
                  background: "var(--ht-canvas)",
                  color: "var(--ht-ink)",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Amount</label>
              <div style={{ position: "relative" }}>
                <span className="ht-mono" style={{ position: "absolute", left: 16, top: 12, fontSize: 24, color: "var(--ht-ink-2)" }}>$</span>
                <input
                  type="text"
                  defaultValue="184.62"
                  className="ht-mono"
                  style={{
                    height: 56,
                    padding: "0 16px 0 36px",
                    borderRadius: 8,
                    border: "1px solid var(--ht-border-strong)",
                    fontSize: 24,
                    background: "var(--ht-canvas)",
                    color: "var(--ht-ink)",
                    width: "100%",
                    boxSizing: "border-box"
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>QuickBooks Category</label>
              <select
                defaultValue="Meals & Entertainment"
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 8,
                  border: "1px solid var(--ht-border-strong)",
                  fontSize: 15,
                  background: "var(--ht-canvas)",
                  color: "var(--ht-ink)",
                  appearance: "none",
                }}
              >
                <option>Meals & Entertainment</option>
              </select>
              <div style={{ fontSize: 12, color: "var(--ht-ink-3)", marginTop: 2 }}>Mapped to QBO account · 6210</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Payment Method</label>
              <div style={{ display: "flex", background: "var(--ht-canvas)", padding: 4, borderRadius: 8, border: "1px solid var(--ht-border-strong)" }}>
                <div style={{ flex: 1, padding: "8px 0", textAlign: "center", background: "var(--ht-surface)", borderRadius: 6, fontSize: 13, fontWeight: 600, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>Personal Card</div>
                <div style={{ flex: 1, padding: "8px 0", textAlign: "center", color: "var(--ht-ink-2)", fontSize: 13, fontWeight: 500 }}>Company Card</div>
                <div style={{ flex: 1, padding: "8px 0", textAlign: "center", color: "var(--ht-ink-2)", fontSize: 13, fontWeight: 500 }}>Cash</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--ht-border)", borderTop: "1px solid var(--ht-border)" }}>
              <label style={{ fontSize: 15, fontWeight: 600, color: "var(--ht-ink)" }}>Reimbursable</label>
              <div style={{ width: 44, height: 24, background: "var(--ht-success)", borderRadius: 999, position: "relative" }}>
                <div style={{ width: 20, height: 20, background: "white", borderRadius: 999, position: "absolute", top: 2, right: 2 }} />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Notes</label>
              <textarea
                style={{
                  height: 80,
                  padding: "12px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--ht-border-strong)",
                  fontSize: 15,
                  background: "var(--ht-canvas)",
                  color: "var(--ht-ink)",
                  resize: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)", display: "block", marginBottom: 12 }}>Receipts</label>
              <div style={{ display: "flex", gap: 12, overflowX: "auto" }}>
                <div style={{ width: 80, height: 100, borderRadius: 8, background: "var(--ht-light-grey)", border: "1px solid var(--ht-border-strong)", position: "relative" }}>
                  <div style={{ position: "absolute", top: -6, right: -6, background: "var(--ht-ink)", color: "white", borderRadius: 999, width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <X size={12} />
                  </div>
                </div>
                <button style={{ width: 80, height: 100, borderRadius: 8, border: "2px dashed var(--ht-border-strong)", background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: "var(--ht-navy)", cursor: "pointer" }}>
                  <Camera size={20} />
                  <span style={{ fontSize: 11, fontWeight: 600, textAlign: "center", padding: "0 4px" }}>Add another receipt</span>
                </button>
              </div>
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
            Cancel
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
            Save line item
          </button>
        </div>
      </div>
    </MobileShell>
  );
}
