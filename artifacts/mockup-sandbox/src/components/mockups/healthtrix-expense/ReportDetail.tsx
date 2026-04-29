import { MobileShell } from "./_shared/Shells";
import { HIMSS_LINES } from "./_shared/data";
import { StatusPill } from "./_shared/StatusPill";
import { StatusTracker } from "./_shared/StatusTracker";
import { Paperclip } from "lucide-react";
import { IOSNavigationBar, IOSList, IOSListItem, IOSButton } from "./_shared/IOSPrimitives";

export function ReportDetail() {
  return (
    <MobileShell>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--ht-canvas)" }}>
        <IOSNavigationBar 
          title="HIMSS 2026 Con..." 
          backText="Reports"
          onBack={() => {}}
          trailing={
            <span style={{ color: "var(--ht-navy)", fontSize: 17, fontWeight: 400 }}>Edit</span>
          }
        />

        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 100 }}>
          {/* Header Area */}
          <div style={{ padding: "16px 20px 8px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <StatusPill status="Manager Review" size="sm" />
            <div className="ht-mono" style={{ fontSize: 44, fontWeight: 700, color: "var(--ht-ink)", letterSpacing: -1, marginTop: 8 }}>
              $2,418.72
            </div>
            <div style={{ fontSize: 15, color: "var(--ht-ink-2)", marginTop: 4 }}>
              HIMSS 2026 Conference — Las Vegas
            </div>
          </div>

          <IOSList>
            <IOSListItem trailing={<span style={{ color: "var(--ht-ink-2)" }}>Priya Raghavan</span>}>Employee</IOSListItem>
            <IOSListItem trailing={<span style={{ color: "var(--ht-ink-2)" }}>Apr 14 — 18</span>}>Period</IOSListItem>
            <IOSListItem isLast trailing={<span style={{ color: "var(--ht-ink-2)" }}>Clinical Ops</span>}>Department</IOSListItem>
          </IOSList>

          <IOSList header="WORKFLOW STATUS">
            <div style={{ padding: "16px 16px 16px 8px" }}>
              <StatusTracker current="Manager Review" variant="vertical" />
            </div>
          </IOSList>

          <IOSList header="LINE ITEMS (9)">
            {HIMSS_LINES.map((line, i) => (
              <IOSListItem 
                key={i} 
                isLast={i === HIMSS_LINES.length - 1}
                trailing={
                  <span className="ht-mono" style={{ color: "var(--ht-ink)", fontWeight: 500 }}>
                    ${line.amount.toFixed(2)}
                  </span>
                }
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontSize: 17 }}>{line.merchant}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, color: "var(--ht-ink-3)" }}>{line.date} · {line.category}</span>
                    {line.receipts && (
                      <span style={{ display: "flex", alignItems: "center", gap: 2, color: "var(--ht-ink-3)" }}>
                        <Paperclip size={10} />
                      </span>
                    )}
                    {!line.hasReceipt && (
                      <span style={{ fontSize: 11, color: "var(--ht-warning)", fontWeight: 500, background: "var(--ht-tint-orange)", padding: "0 6px", borderRadius: 4 }}>
                        No receipt
                      </span>
                    )}
                  </div>
                </div>
              </IOSListItem>
            ))}
          </IOSList>

          <IOSList header="APPROVAL HISTORY">
            <IOSListItem isLast>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "4px 0" }}>
                <div style={{ width: 36, height: 36, borderRadius: 999, background: "var(--ht-tint-navy)", color: "var(--ht-navy)", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 13, flexShrink: 0 }}>PR</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: "var(--ht-ink)" }}>Submitted by Priya Raghavan</div>
                  <div style={{ fontSize: 14, color: "var(--ht-ink-3)", marginTop: 2 }}>Apr 19, 2026 9:42 AM</div>
                </div>
              </div>
            </IOSListItem>
          </IOSList>
        </div>

        {/* Floating Action */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 16px 32px", background: "linear-gradient(to top, var(--ht-canvas) 70%, transparent)", display: "flex" }}>
          <IOSButton variant="secondary" style={{ boxShadow: "0 4px 14px rgba(46, 69, 107, 0.15)" }}>
            Withdraw Report
          </IOSButton>
        </div>
      </div>
    </MobileShell>
  );
}