import "../_group.css";

export function MobileShell({
  children,
  showStatusBar = true,
  showHomeIndicator = true,
  time = "9:41",
}: {
  children: React.ReactNode;
  showStatusBar?: boolean;
  showHomeIndicator?: boolean;
  time?: string;
}) {
  return (
    <div
      className="ht-root"
      style={{ minHeight: "100vh", display: "grid", placeItems: "start center", padding: 0 }}
    >
      <div className="ht-mobile-shell" style={{ borderRadius: 44, boxShadow: "0 0 0 10px #000", margin: "20px 0" }}>
        {showStatusBar && (
          <div className="ht-mobile-statusbar" style={{ height: 54, paddingTop: 10, position: "relative", zIndex: 100 }}>
            {/* Dynamic Island Hint */}
            <div style={{ position: "absolute", top: 11, left: "50%", transform: "translateX(-50%)", width: 120, height: 32, background: "black", borderRadius: 16 }} />
            <span style={{ fontSize: 15, fontWeight: 600, paddingLeft: 12, zIndex: 1 }}>{time}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, paddingRight: 12, zIndex: 1 }}>
              {/* Signal */}
              <svg width="17" height="11" viewBox="0 0 17 11" fill="none" aria-hidden>
                <rect x="0" y="7" width="3" height="4" rx="0.5" fill="currentColor" />
                <rect x="4.5" y="5" width="3" height="6" rx="0.5" fill="currentColor" />
                <rect x="9" y="3" width="3" height="8" rx="0.5" fill="currentColor" />
                <rect x="13.5" y="0" width="3" height="11" rx="0.5" fill="currentColor" />
              </svg>
              {/* Wifi */}
              <svg width="15" height="11" viewBox="0 0 15 11" fill="none" aria-hidden>
                <path d="M7.5 2.2C9.6 2.2 11.6 3 13.1 4.4l1.4-1.5C12.6 1 10.1 0 7.5 0S2.4 1 0 2.9l1.4 1.5C2.9 3 4.9 2.2 7.5 2.2Z" fill="currentColor" />
                <path d="M7.5 5.5c1.3 0 2.6.5 3.5 1.4l1.4-1.4C11 4.4 9.3 3.7 7.5 3.7S4 4.4 2.6 5.5L4 7c1-.9 2.2-1.4 3.5-1.4Z" fill="currentColor" />
                <circle cx="7.5" cy="9.4" r="1.5" fill="currentColor" />
              </svg>
              {/* Battery */}
              <svg width="26" height="11" viewBox="0 0 26 11" fill="none" aria-hidden>
                <rect x="0.5" y="0.5" width="22" height="10" rx="2.5" stroke="currentColor" opacity="0.5" />
                <rect x="2" y="2" width="19" height="7" rx="1.5" fill="currentColor" />
                <rect x="23.5" y="3.5" width="2" height="4" rx="1" fill="currentColor" opacity="0.5" />
              </svg>
            </span>
          </div>
        )}
        <div style={{ minHeight: showStatusBar ? 800 : 844, position: "relative", overflow: "hidden", borderRadius: showStatusBar ? "0 0 44px 44px" : 44 }}>{children}</div>
        {showHomeIndicator && <div className="ht-mobile-homeindicator" style={{ bottom: 8, zIndex: 100 }} />}
      </div>
    </div>
  );
}

export function DesktopShell({
  children,
  width = 1280,
  height = 900,
}: {
  children: React.ReactNode;
  width?: number;
  height?: number;
}) {
  return (
    <div
      className="ht-root"
      style={{ minHeight: "100vh", padding: 0 }}
    >
      <div style={{ width, minHeight: height, margin: "0 auto", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}
