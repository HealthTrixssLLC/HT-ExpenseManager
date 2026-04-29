import { MobileShell } from "./_shared/Shells";
import { HealthtrixMark } from "./_shared/BrandHeader";

export function Login() {
  return (
    <MobileShell>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: 800,
          padding: "24px 24px 48px",
          background: "linear-gradient(180deg, var(--ht-surface) 0%, var(--ht-canvas) 100%)",
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 48 }}>
            <HealthtrixMark size={40} />
          </div>

          <div
            className="ht-elev-2"
            style={{
              background: "var(--ht-surface)",
              padding: 32,
              borderRadius: 16,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              border: "1px solid var(--ht-border)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Email</label>
              <input
                type="email"
                defaultValue="priya.raghavan@healthtrix.com"
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 8,
                  border: "1px solid var(--ht-border-strong)",
                  fontSize: 15,
                  outline: "none",
                  color: "var(--ht-ink)",
                  background: "var(--ht-surface)",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Password</label>
              <input
                type="password"
                defaultValue="••••••••"
                style={{
                  height: 48,
                  padding: "0 16px",
                  borderRadius: 8,
                  border: "1px solid var(--ht-border-strong)",
                  fontSize: 15,
                  outline: "none",
                  color: "var(--ht-ink)",
                  background: "var(--ht-surface)",
                }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" defaultChecked style={{ width: 18, height: 18, accentColor: "var(--ht-navy)" }} />
                <span style={{ fontSize: 14, color: "var(--ht-ink-2)", fontWeight: 500 }}>Remember me</span>
              </label>
              <span style={{ fontSize: 14, color: "var(--ht-navy)", fontWeight: 600, cursor: "pointer" }}>
                Forgot password?
              </span>
            </div>

            <button
              style={{
                height: 48,
                marginTop: 12,
                background: "var(--ht-navy)",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(46, 69, 107, 0.2)",
              }}
            >
              Sign in
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: 14, color: "var(--ht-ink-3)", fontWeight: 500 }}>
          Need an account? <span style={{ color: "var(--ht-navy)", fontWeight: 600 }}>Contact your System Admin</span>
        </div>
      </div>
    </MobileShell>
  );
}
