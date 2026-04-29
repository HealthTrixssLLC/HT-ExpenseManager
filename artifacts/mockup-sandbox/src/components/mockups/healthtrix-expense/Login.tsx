import { MobileShell } from "./_shared/Shells";
import { HealthtrixMark } from "./_shared/BrandHeader";
import { IOSButton } from "./_shared/IOSPrimitives";
import { useState } from "react";

export function Login() {
  const [showEmail, setShowEmail] = useState(false);

  return (
    <MobileShell>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "24px 24px 48px",
          background: "var(--ht-surface)",
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 64 }}>
            <HealthtrixMark size={48} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <IOSButton variant="primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Sign in with Healthtrix SSO
            </IOSButton>

            {!showEmail ? (
              <IOSButton variant="tertiary" onClick={() => setShowEmail(true)}>
                Continue with email
              </IOSButton>
            ) : (
              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  animation: "ht-slide-down 0.3s ease-out",
                }}
              >
                <div style={{ background: "var(--ht-canvas)", borderRadius: 14, overflow: "hidden" }}>
                  <input
                    type="email"
                    placeholder="Email"
                    defaultValue="priya.raghavan@healthtrix.com"
                    style={{
                      width: "100%",
                      height: 50,
                      padding: "0 16px",
                      border: "none",
                      borderBottom: "1px solid var(--ht-border)",
                      fontSize: 17,
                      background: "transparent",
                      color: "var(--ht-ink)",
                      outline: "none",
                    }}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    defaultValue="••••••••"
                    style={{
                      width: "100%",
                      height: 50,
                      padding: "0 16px",
                      border: "none",
                      fontSize: 17,
                      background: "transparent",
                      color: "var(--ht-ink)",
                      outline: "none",
                    }}
                  />
                </div>
                
                <IOSButton variant="secondary">
                  Sign In
                </IOSButton>
                
                <div style={{ textAlign: "center", marginTop: 8 }}>
                  <span style={{ fontSize: 15, color: "var(--ht-navy)", fontWeight: 400, cursor: "pointer" }}>
                    Forgot password?
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "var(--ht-canvas)", borderRadius: 999 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ht-ink-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <circle cx="12" cy="12" r="3" />
              <path d="M12 17v2" />
              <path d="M12 5v2" />
              <path d="M17 12h2" />
              <path d="M5 12h2" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ht-ink-2)" }}>Face ID enabled</span>
          </div>
          
          <div style={{ textAlign: "center", fontSize: 13, color: "var(--ht-ink-3)", fontWeight: 400 }}>
            Need an account? <span style={{ color: "var(--ht-navy)", fontWeight: 500 }}>Contact your System Admin</span>
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
