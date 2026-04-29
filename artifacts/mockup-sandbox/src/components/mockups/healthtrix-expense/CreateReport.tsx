import { MobileShell } from "./_shared/Shells";
import { DEPARTMENTS } from "./_shared/data";
import { IOSNavigationBar, IOSList, IOSListItem, IOSButton } from "./_shared/IOSPrimitives";

export function CreateReport() {
  return (
    <MobileShell>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--ht-canvas)", borderRadius: "14px 14px 0 0", marginTop: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, paddingBottom: 4, background: "var(--ht-surface)" }}>
          <div style={{ width: 36, height: 5, background: "var(--ht-border)", borderRadius: 999 }} />
        </div>
        
        <IOSNavigationBar 
          title="New Report" 
          leading={<span style={{ color: "var(--ht-navy)", fontSize: 17 }}>Cancel</span>}
          border={false}
          background="var(--ht-surface)"
        />

        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 100 }}>
          <IOSList>
            <div style={{ padding: "0 16px" }}>
              <input
                type="text"
                placeholder="Report Name"
                defaultValue="HIMSS 2026 Conference"
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
              <textarea
                placeholder="Business Purpose"
                defaultValue="Attending HIMSS 2026 to evaluate clinical workflow vendors."
                style={{
                  width: "100%",
                  height: 100,
                  padding: "16px 0",
                  border: "none",
                  fontSize: 17,
                  background: "transparent",
                  color: "var(--ht-ink)",
                  outline: "none",
                  resize: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>
          </IOSList>

          <IOSList>
            <IOSListItem trailing={<span style={{ color: "var(--ht-ink)" }}>Apr 14, 2026</span>}>
              Start Date
            </IOSListItem>
            <IOSListItem isLast trailing={<span style={{ color: "var(--ht-ink)" }}>Apr 18, 2026</span>}>
              End Date
            </IOSListItem>
          </IOSList>

          <IOSList>
            <IOSListItem trailing={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--ht-ink-2)" }}>Clinical Operations</span>
                <svg width="9" height="14" viewBox="0 0 9 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 2l5 5-5 5"/></svg>
              </div>
            }>
              Department
            </IOSListItem>
            <IOSListItem isLast trailing={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--ht-ink-2)" }}>Standard Travel</span>
                <svg width="9" height="14" viewBox="0 0 9 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 2l5 5-5 5"/></svg>
              </div>
            }>
              Policy
            </IOSListItem>
          </IOSList>
        </div>

        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px", background: "var(--ht-surface)", borderTop: "1px solid var(--ht-border)", display: "flex", gap: 12 }}>
          <IOSButton variant="primary">
            Continue
          </IOSButton>
        </div>
      </div>
    </MobileShell>
  );
}