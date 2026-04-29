import { MobileShell } from "./_shared/Shells";
import { IOSNavigationBar, IOSList, IOSListItem, IOSButton } from "./_shared/IOSPrimitives";
import { Camera, Image as ImageIcon } from "lucide-react";

export function AddLineItem() {
  return (
    <MobileShell>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--ht-canvas)", borderRadius: "14px 14px 0 0", marginTop: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, paddingBottom: 4, background: "var(--ht-surface)" }}>
          <div style={{ width: 36, height: 5, background: "var(--ht-border)", borderRadius: 999 }} />
        </div>
        
        <IOSNavigationBar 
          title="Add Expense" 
          leading={<span style={{ color: "var(--ht-navy)", fontSize: 17 }}>Cancel</span>}
          border={false}
          background="var(--ht-surface)"
        />

        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 100 }}>
          {/* Amount Area - Apple Wallet Style */}
          <div style={{ background: "var(--ht-surface)", padding: "32px 16px 40px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
              <span style={{ fontSize: 32, fontWeight: 500, color: "var(--ht-ink-2)", marginTop: 8 }}>$</span>
              <input
                type="text"
                defaultValue="184.62"
                style={{
                  fontSize: 64,
                  fontWeight: 600,
                  background: "transparent",
                  border: "none",
                  color: "var(--ht-ink)",
                  width: "200px",
                  textAlign: "center",
                  outline: "none",
                  letterSpacing: -1.5,
                }}
              />
            </div>
            <div style={{ fontSize: 15, color: "var(--ht-ink-3)", marginTop: -8 }}>
              EXP-2604-118
            </div>
          </div>

          <IOSList>
            <div style={{ padding: "0 16px" }}>
              <input
                type="text"
                placeholder="Merchant"
                defaultValue="Jaleo Las Vegas"
                style={{
                  width: "100%",
                  height: 50,
                  border: "none",
                  borderBottom: "1px solid var(--ht-border)",
                  fontSize: 17,
                  background: "transparent",
                  color: "var(--ht-ink)",
                  outline: "none",
                }}
              />
            </div>
            <IOSListItem trailing={<span style={{ color: "var(--ht-ink)" }}>Apr 15, 2026</span>}>
              Date
            </IOSListItem>
            <IOSListItem trailing={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--ht-ink-2)" }}>Meals & Ent.</span>
                <svg width="9" height="14" viewBox="0 0 9 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 2l5 5-5 5"/></svg>
              </div>
            }>
              Category
            </IOSListItem>
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--ht-border)" }}>
              {/* Segmented Control */}
              <div style={{ display: "flex", background: "var(--ht-canvas)", borderRadius: 8, padding: 2, position: "relative" }}>
                <div style={{ flex: 1, padding: "6px 0", textAlign: "center", fontSize: 13, fontWeight: 600, zIndex: 1, background: "white", borderRadius: 6, boxShadow: "0 3px 8px rgba(0,0,0,0.12), 0 3px 1px rgba(0,0,0,0.04)" }}>Personal</div>
                <div style={{ flex: 1, padding: "6px 0", textAlign: "center", fontSize: 13, fontWeight: 500, zIndex: 1 }}>Company</div>
                <div style={{ flex: 1, padding: "6px 0", textAlign: "center", fontSize: 13, fontWeight: 500, zIndex: 1 }}>Cash</div>
              </div>
            </div>
          </IOSList>

          <IOSList>
            <div style={{ padding: "16px", display: "flex", gap: 16 }}>
              <div style={{ width: 60, height: 80, borderRadius: 8, background: "var(--ht-canvas)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: "var(--ht-navy)" }}>
                <Camera size={20} strokeWidth={1.5} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontSize: 17, fontWeight: 400, color: "var(--ht-ink)" }}>Attach Receipt</div>
                <div style={{ fontSize: 13, color: "var(--ht-ink-3)" }}>Take photo or choose from library</div>
              </div>
            </div>
          </IOSList>
        </div>

        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px", background: "var(--ht-surface)", borderTop: "1px solid var(--ht-border)", display: "flex", flexDirection: "column", gap: 12 }}>
          <IOSButton variant="primary">
            Add Expense
          </IOSButton>
        </div>
      </div>
    </MobileShell>
  );
}