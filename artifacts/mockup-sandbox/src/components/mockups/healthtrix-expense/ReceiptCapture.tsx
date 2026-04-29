import { MobileShell } from "./_shared/Shells";
import { X, Zap, Image as ImageIcon, CameraReverse, Plus } from "lucide-react";

export function ReceiptCapture() {
  return (
    <MobileShell showStatusBar={false}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0E1521", color: "white" }}>
        {/* Dark Status Bar Match */}
        <div style={{ height: 44, display: "flex", alignItems: "center", padding: "0 22px", fontSize: 14, fontWeight: 600, justifyContent: "space-between" }}>
          <span>9:41</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <svg width="17" height="11" viewBox="0 0 17 11" fill="none"><rect x="0" y="7" width="3" height="4" rx="0.5" fill="white" /><rect x="4.5" y="5" width="3" height="6" rx="0.5" fill="white" /><rect x="9" y="3" width="3" height="8" rx="0.5" fill="white" /><rect x="13.5" y="0" width="3" height="11" rx="0.5" fill="white" /></svg>
            <svg width="15" height="11" viewBox="0 0 15 11" fill="none"><path d="M7.5 2.2C9.6 2.2 11.6 3 13.1 4.4l1.4-1.5C12.6 1 10.1 0 7.5 0S2.4 1 0 2.9l1.4 1.5C2.9 3 4.9 2.2 7.5 2.2Z" fill="white" /><path d="M7.5 5.5c1.3 0 2.6.5 3.5 1.4l1.4-1.4C11 4.4 9.3 3.7 7.5 3.7S4 4.4 2.6 5.5L4 7c1-.9 2.2-1.4 3.5-1.4Z" fill="white" /><circle cx="7.5" cy="9.4" r="1.5" fill="white" /></svg>
            <svg width="26" height="11" viewBox="0 0 26 11" fill="none"><rect x="0.5" y="0.5" width="22" height="10" rx="2.5" stroke="white" opacity="0.5" /><rect x="2" y="2" width="19" height="7" rx="1.5" fill="white" /><rect x="23.5" y="3.5" width="2" height="4" rx="1" fill="white" opacity="0.5" /></svg>
          </span>
        </div>

        {/* Top Chrome */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <X size={28} color="white" />
            <span style={{ fontSize: 17, fontWeight: 500 }}>Cancel</span>
          </div>
          <Zap size={24} color="white" />
        </div>

        {/* Viewfinder Area */}
        <div style={{ flex: 1, position: "relative", display: "grid", placeItems: "center", padding: 20 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} />
          
          {/* Frame */}
          <div style={{ width: "100%", height: "80%", border: "2px solid rgba(255,255,255,0.2)", position: "relative", zIndex: 1 }}>
            {/* Brackets */}
            <div style={{ position: "absolute", top: -2, left: -2, width: 30, height: 30, borderTop: "4px solid var(--ht-orange)", borderLeft: "4px solid var(--ht-orange)" }} />
            <div style={{ position: "absolute", top: -2, right: -2, width: 30, height: 30, borderTop: "4px solid var(--ht-orange)", borderRight: "4px solid var(--ht-orange)" }} />
            <div style={{ position: "absolute", bottom: -2, left: -2, width: 30, height: 30, borderBottom: "4px solid var(--ht-orange)", borderLeft: "4px solid var(--ht-orange)" }} />
            <div style={{ position: "absolute", bottom: -2, right: -2, width: 30, height: 30, borderBottom: "4px solid var(--ht-orange)", borderRight: "4px solid var(--ht-orange)" }} />
            
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "rgba(0,0,0,0.6)", padding: "8px 16px", borderRadius: 20, fontSize: 14, fontWeight: 500, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
              Align receipt within the frame
            </div>
          </div>
        </div>

        {/* Thumbnail Strip */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8, background: "rgba(0,0,0,0.3)" }}>
          <div style={{ display: "flex", gap: 12, overflowX: "auto" }}>
            <div style={{ width: 60, height: 80, borderRadius: 6, background: "var(--ht-light-grey)", position: "relative" }}>
              <div style={{ position: "absolute", top: -6, right: -6, background: "black", color: "white", borderRadius: 999, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid white" }}><X size={10} /></div>
            </div>
            <div style={{ width: 60, height: 80, borderRadius: 6, background: "var(--ht-light-teal)", position: "relative" }}>
              <div style={{ position: "absolute", top: -6, right: -6, background: "black", color: "white", borderRadius: 999, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid white" }}><X size={10} /></div>
            </div>
            <div style={{ width: 60, height: 80, borderRadius: 6, background: "rgba(255,255,255,0.1)", display: "grid", placeItems: "center", border: "1px dashed rgba(255,255,255,0.3)" }}>
              <Plus size={20} color="white" />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", textAlign: "center" }}>
            2 of 5 captured · Tap to preview
          </div>
        </div>

        {/* Bottom Chrome */}
        <div style={{ padding: "20px 32px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <ImageIcon size={28} color="white" />
            <span style={{ fontSize: 11, fontWeight: 500 }}>Library</span>
          </div>
          
          <div style={{ width: 72, height: 72, borderRadius: 999, border: "4px solid rgba(255,255,255,0.5)", display: "grid", placeItems: "center", padding: 4 }}>
            <div style={{ width: "100%", height: "100%", borderRadius: 999, background: "white" }} />
          </div>

          <div style={{ width: 32, display: "flex", justifyContent: "flex-end" }}>
            <CameraReverse size={28} color="white" />
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
