import { MobileShell } from "./_shared/Shells";
import { X, Zap, Image as ImageIcon, Plus } from "lucide-react";

export function ReceiptCapture() {
  return (
    <MobileShell showStatusBar={false}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: 844, background: "#000", color: "white" }}>
        {/* Dark Status Bar Match */}
        <div style={{ position: "relative", height: 54, paddingTop: 10, display: "flex", alignItems: "center", padding: "10px 22px 0", fontSize: 15, fontWeight: 600, justifyContent: "space-between" }}>
          <span style={{ zIndex: 1 }}>9:41</span>
          <div style={{ position: "absolute", top: 11, left: "50%", transform: "translateX(-50%)", width: 120, height: 32, background: "#000", borderRadius: 16, zIndex: 0 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, zIndex: 1 }}>
            <svg width="17" height="11" viewBox="0 0 17 11" fill="none"><rect x="0" y="7" width="3" height="4" rx="0.5" fill="white" /><rect x="4.5" y="5" width="3" height="6" rx="0.5" fill="white" /><rect x="9" y="3" width="3" height="8" rx="0.5" fill="white" /><rect x="13.5" y="0" width="3" height="11" rx="0.5" fill="white" /></svg>
            <svg width="15" height="11" viewBox="0 0 15 11" fill="none"><path d="M7.5 2.2C9.6 2.2 11.6 3 13.1 4.4l1.4-1.5C12.6 1 10.1 0 7.5 0S2.4 1 0 2.9l1.4 1.5C2.9 3 4.9 2.2 7.5 2.2Z" fill="white" /><path d="M7.5 5.5c1.3 0 2.6.5 3.5 1.4l1.4-1.4C11 4.4 9.3 3.7 7.5 3.7S4 4.4 2.6 5.5L4 7c1-.9 2.2-1.4 3.5-1.4Z" fill="white" /><circle cx="7.5" cy="9.4" r="1.5" fill="white" /></svg>
            <svg width="26" height="11" viewBox="0 0 26 11" fill="none"><rect x="0.5" y="0.5" width="22" height="10" rx="2.5" stroke="white" opacity="0.5" /><rect x="2" y="2" width="19" height="7" rx="1.5" fill="white" /><rect x="23.5" y="3.5" width="2" height="4" rx="1" fill="white" opacity="0.5" /></svg>
          </span>
        </div>

        {/* Top Chrome */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px" }}>
          <span style={{ fontSize: 17, fontWeight: 400 }}>Cancel</span>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <div style={{ padding: "4px 12px", background: "rgba(255,255,255,0.2)", borderRadius: 999, fontSize: 13, fontWeight: 600 }}>Multi</div>
            <Zap size={24} color="white" fill="white" />
          </div>
        </div>

        {/* Viewfinder Area */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", margin: "0 0", borderRadius: 0 }}>
          {/* Faked camera feed with edge detection */}
          <div style={{ position: "absolute", inset: 0, background: "#1C1C1E" }} />
          
          {/* Edge Detection Overlay */}
          <div style={{ position: "absolute", top: "15%", bottom: "15%", left: "10%", right: "10%", border: "2px solid var(--ht-orange)", background: "rgba(254, 160, 2, 0.1)", transform: "perspective(500px) rotateX(5deg) rotateY(-2deg)", transition: "all 0.1s linear" }}>
            <div style={{ position: "absolute", top: -4, left: -4, width: 20, height: 20, borderTop: "4px solid var(--ht-orange)", borderLeft: "4px solid var(--ht-orange)" }} />
            <div style={{ position: "absolute", top: -4, right: -4, width: 20, height: 20, borderTop: "4px solid var(--ht-orange)", borderRight: "4px solid var(--ht-orange)" }} />
            <div style={{ position: "absolute", bottom: -4, left: -4, width: 20, height: 20, borderBottom: "4px solid var(--ht-orange)", borderLeft: "4px solid var(--ht-orange)" }} />
            <div style={{ position: "absolute", bottom: -4, right: -4, width: 20, height: 20, borderBottom: "4px solid var(--ht-orange)", borderRight: "4px solid var(--ht-orange)" }} />
          </div>
        </div>

        {/* Bottom Chrome */}
        <div style={{ background: "#000", paddingBottom: 48 }}>
          {/* Thumbnail Strip */}
          <div style={{ padding: "16px 20px", display: "flex", gap: 12, overflowX: "auto" }}>
            <div style={{ width: 44, height: 56, borderRadius: 4, background: "white", position: "relative" }}>
              <div style={{ position: "absolute", top: -6, right: -6, background: "rgba(0,0,0,0.5)", color: "white", borderRadius: 999, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={10} /></div>
            </div>
            <div style={{ width: 44, height: 56, borderRadius: 4, background: "rgba(255,255,255,0.8)", position: "relative" }}>
              <div style={{ position: "absolute", top: -6, right: -6, background: "rgba(0,0,0,0.5)", color: "white", borderRadius: 999, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={10} /></div>
            </div>
          </div>

          <div style={{ padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ImageIcon size={24} color="white" />
            </div>
            
            {/* iOS Shutter Button */}
            <div style={{ width: 72, height: 72, borderRadius: 999, border: "4px solid white", display: "grid", placeItems: "center", padding: 3 }}>
              <div style={{ width: "100%", height: "100%", borderRadius: 999, background: "white" }} />
            </div>

            <div style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 17, fontWeight: 500, color: "var(--ht-orange)" }}>Save</span>
            </div>
          </div>
        </div>
      </div>
    </MobileShell>
  );
}