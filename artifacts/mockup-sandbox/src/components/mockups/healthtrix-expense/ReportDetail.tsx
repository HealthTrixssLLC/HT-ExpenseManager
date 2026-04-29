import { MobileShell } from "./_shared/Shells";
import { HIMSS_LINES } from "./_shared/data";
import { StatusPill } from "./_shared/StatusPill";
import { StatusTracker } from "./_shared/StatusTracker";
import { ChevronLeft, Paperclip } from "lucide-react";

export function ReportDetail() {
  return (
    <MobileShell>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--ht-canvas)" }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", background: "var(--ht-surface)", borderBottom: "1px solid var(--ht-border)", display: "flex", alignItems: "center", gap: 16, position: "sticky", top: 0, zIndex: 10 }}>
          <ChevronLeft size={24} color="var(--ht-navy)" />
          <div>
            <div style={{ fontSize: 13, color: "var(--ht-ink-3)", fontWeight: 600 }}>EXP-2604-118</div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--ht-ink)", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }}>HIMSS 2026 Conference — Las Vegas</h1>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            
            {/* Header Card */}
            <div className="ht-elev-1" style={{ background: "var(--ht-surface)", padding: 20, borderRadius: 12, border: "1px solid var(--ht-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <StatusPill status="Manager Review" size="md" />
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Total</div>
                  <div className="ht-mono" style={{ fontSize: 24, fontWeight: 700, color: "var(--ht-ink)" }}>$2,418.72</div>
                </div>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px solid var(--ht-border)", paddingTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, color: "var(--ht-ink-2)", fontWeight: 500 }}>Employee</span>
                  <span style={{ fontSize: 14, color: "var(--ht-ink)", fontWeight: 600 }}>Priya Raghavan</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, color: "var(--ht-ink-2)", fontWeight: 500 }}>Department</span>
                  <span style={{ fontSize: 14, color: "var(--ht-ink)", fontWeight: 600 }}>Clinical Operations</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, color: "var(--ht-ink-2)", fontWeight: 500 }}>Period</span>
                  <span style={{ fontSize: 14, color: "var(--ht-ink)", fontWeight: 600 }}>Apr 14 — Apr 18, 2026</span>
                </div>
              </div>
            </div>

            {/* Workflow Tracker */}
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 16 }}>Workflow status</h2>
              <div className="ht-elev-1" style={{ background: "var(--ht-surface)", padding: "20px 20px 20px 12px", borderRadius: 12, border: "1px solid var(--ht-border)" }}>
                <StatusTracker current="Manager Review" variant="vertical" />
              </div>
            </div>

            {/* Line Items */}
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 12 }}>Line items (9)</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {HIMSS_LINES.map((line, i) => (
                  <div key={i} className="ht-elev-1" style={{ background: "var(--ht-surface)", padding: 16, borderRadius: 12, border: "1px solid var(--ht-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ht-ink)", lineHeight: 1.3 }}>
                        {line.date} · {line.merchant}
                      </div>
                      <div className="ht-mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--ht-ink)" }}>
                        ${line.amount.toFixed(2)}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 13, color: "var(--ht-ink-2)", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                        {line.category}
                        {line.receipts && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--ht-canvas)", padding: "2px 6px", borderRadius: 4 }}>
                            <Paperclip size={12} /> {line.receipts}
                          </span>
                        )}
                      </div>
                      {!line.hasReceipt && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--ht-warning)", background: "var(--ht-tint-orange)", padding: "2px 8px", borderRadius: 999 }}>
                          <div style={{ width: 6, height: 6, borderRadius: 999, background: "var(--ht-warning)" }} />
                          Receipt missing
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Approval History */}
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 12 }}>Approval history</h2>
              <div className="ht-elev-1" style={{ background: "var(--ht-surface)", padding: 16, borderRadius: 12, border: "1px solid var(--ht-border)", display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 999, background: "var(--ht-tint-navy)", color: "var(--ht-navy)", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 12, flexShrink: 0 }}>PR</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Submitted by Priya Raghavan</div>
                    <div style={{ fontSize: 13, color: "var(--ht-ink-3)", marginTop: 2 }}>Apr 19, 2026 9:42 AM</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 999, background: "var(--ht-tint-orange)", color: "var(--ht-orange)", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 12, flexShrink: 0 }}>MC</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Awaiting review</div>
                    <div style={{ fontSize: 13, color: "var(--ht-ink-3)", marginTop: 2 }}>Marcus Chen (Manager Approver)</div>
                  </div>
                </div>
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
              color: "var(--ht-danger)",
              border: "1px solid var(--ht-border-strong)",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Withdraw
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
            Add comment
          </button>
        </div>
      </div>
    </MobileShell>
  );
}
