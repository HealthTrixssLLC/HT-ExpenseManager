import { MobileShell } from "./_shared/Shells";
import { SAMPLE_REPORTS } from "./_shared/data";
import { StatusPill } from "./_shared/StatusPill";
import { Plus, Home, FileText, CreditCard, User, ChevronRight } from "lucide-react";

export function EmployeeDashboard() {
  const reports = SAMPLE_REPORTS.filter(r => r.employee === "Priya Raghavan").slice(0, 4);
  if (reports.length < 4) {
    reports.push(...SAMPLE_REPORTS.filter(r => r.employee !== "Priya Raghavan").slice(0, 4 - reports.length));
  }

  return (
    <MobileShell>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--ht-canvas)" }}>
        {/* Header */}
        <div style={{ padding: "24px 24px 20px", background: "var(--ht-surface)", borderBottom: "1px solid var(--ht-border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ht-ink)", margin: 0, letterSpacing: -0.3 }}>
                Good afternoon, Priya
              </h1>
              <div style={{ fontSize: 13, color: "var(--ht-ink-3)", fontWeight: 500, marginTop: 4 }}>
                Employee · Clinical Operations
              </div>
            </div>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                background: "var(--ht-tint-navy)",
                color: "var(--ht-navy)",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              PR
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
          {/* Stats Strip */}
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, margin: "0 -20px", paddingLeft: 20, paddingRight: 20 }}>
            {[
              { label: "In Progress", value: "2" },
              { label: "Awaiting Approval", value: "1" },
              { label: "Reimbursed YTD", value: "$4,287.40", isCurrency: true },
            ].map(stat => (
              <div
                key={stat.label}
                className="ht-elev-1"
                style={{
                  background: "var(--ht-surface)",
                  padding: "16px",
                  borderRadius: 12,
                  minWidth: 130,
                  flexShrink: 0,
                  border: "1px solid var(--ht-border)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {stat.label}
                </div>
                <div className={stat.isCurrency ? "ht-mono" : ""} style={{ fontSize: 20, fontWeight: 700, color: "var(--ht-ink)", marginTop: 8 }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* New Expense Button */}
          <button
            style={{
              width: "100%",
              height: 56,
              background: "var(--ht-navy)",
              color: "white",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 16,
              fontWeight: 600,
              border: "none",
              marginTop: 24,
              marginBottom: 32,
              boxShadow: "0 4px 12px rgba(46, 69, 107, 0.2)",
            }}
          >
            <Plus size={20} />
            New expense report
          </button>

          {/* Recent Reports */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--ht-ink)" }}>Recent reports</h2>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-navy)" }}>View all</span>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {reports.map(r => (
                <div
                  key={r.id}
                  className="ht-elev-1"
                  style={{
                    background: "var(--ht-surface)",
                    padding: 16,
                    borderRadius: 12,
                    border: "1px solid var(--ht-border)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ flex: 1, paddingRight: 16 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ht-ink)", lineHeight: 1.3, marginBottom: 4 }}>
                        {r.title}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--ht-ink-3)", fontWeight: 500 }}>
                        {r.id} · Apr period
                      </div>
                    </div>
                    <div className="ht-mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--ht-ink)" }}>
                      ${r.total.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <StatusPill status={r.status} />
                    <ChevronRight size={18} color="var(--ht-ink-3)" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div style={{ display: "flex", borderTop: "1px solid var(--ht-border)", background: "var(--ht-surface)", paddingBottom: 16 }}>
          {[
            { icon: Home, label: "Home", active: true },
            { icon: FileText, label: "Reports" },
            { icon: CreditCard, label: "Receipts" },
            { icon: User, label: "Profile" },
          ].map(tab => (
            <div key={tab.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0", gap: 4, color: tab.active ? "var(--ht-navy)" : "var(--ht-ink-3)" }}>
              <tab.icon size={24} strokeWidth={tab.active ? 2.5 : 2} />
              <span style={{ fontSize: 11, fontWeight: tab.active ? 700 : 500 }}>{tab.label}</span>
            </div>
          ))}
        </div>
      </div>
    </MobileShell>
  );
}
