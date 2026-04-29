import { MobileShell } from "./_shared/Shells";
import { SAMPLE_REPORTS } from "./_shared/data";
import { StatusPill } from "./_shared/StatusPill";
import { Plus, FileText, CreditCard, User, ChevronRight } from "lucide-react";
import { IOSNavigationBar, IOSList, IOSListItem } from "./_shared/IOSPrimitives";

export function EmployeeDashboard() {
  const reports = SAMPLE_REPORTS.filter(r => r.employee === "Priya Raghavan").slice(0, 4);
  if (reports.length < 4) {
    reports.push(...SAMPLE_REPORTS.filter(r => r.employee !== "Priya Raghavan").slice(0, 4 - reports.length));
  }

  return (
    <MobileShell>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--ht-canvas)" }}>
        <IOSNavigationBar 
          title="Reports" 
          largeTitle={true}
          leading={
            <div style={{ width: 32, height: 32, borderRadius: 999, background: "var(--ht-tint-navy)", color: "var(--ht-navy)", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 13 }}>
              PR
            </div>
          }
          trailing={
            <button style={{ background: "transparent", border: "none", color: "var(--ht-navy)", padding: 0 }}>
              <Plus size={28} strokeWidth={2} />
            </button>
          }
        />

        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 100 }}>
          {/* Stats Strip */}
          <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "16px", paddingRight: 16 }}>
            {[
              { label: "In Progress", value: "2", active: true },
              { label: "Awaiting", value: "1", active: false },
              { label: "YTD", value: "$4,287.40", active: false, isCurrency: true },
            ].map(stat => (
              <div
                key={stat.label}
                style={{
                  background: stat.active ? "var(--ht-navy)" : "var(--ht-surface)",
                  padding: "16px",
                  borderRadius: 16,
                  minWidth: 140,
                  flexShrink: 0,
                  border: stat.active ? "none" : "1px solid var(--ht-border)",
                  boxShadow: stat.active ? "0 4px 12px rgba(46, 69, 107, 0.2)" : "none",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: stat.active ? "rgba(255,255,255,0.8)" : "var(--ht-ink-3)", marginBottom: 8 }}>
                  {stat.label}
                </div>
                <div className={stat.isCurrency ? "ht-mono" : ""} style={{ fontSize: 24, fontWeight: 700, color: stat.active ? "white" : "var(--ht-ink)" }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          <IOSList header="RECENT">
            {reports.map((r, i) => (
              <IOSListItem 
                key={r.id} 
                isLast={i === reports.length - 1}
                trailing={<ChevronRight size={20} color="var(--ht-border)" />}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingRight: 8 }}>
                  <div style={{ fontSize: 17, fontWeight: 400, color: "var(--ht-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.title}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <StatusPill status={r.status} size="xs" />
                    <span className="ht-mono" style={{ fontSize: 15, fontWeight: 500, color: "var(--ht-ink-2)" }}>
                      ${r.total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </IOSListItem>
            ))}
          </IOSList>
        </div>

        {/* Tab Bar */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", borderTop: "0.5px solid rgba(0,0,0,0.1)", background: "rgba(255,255,255,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", paddingBottom: 24, paddingTop: 8 }}>
          {[
            { icon: FileText, label: "Reports", active: true },
            { icon: CreditCard, label: "Receipts" },
            { icon: User, label: "Profile" },
          ].map(tab => (
            <div key={tab.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: tab.active ? "var(--ht-navy)" : "var(--ht-ink-3)" }}>
              <tab.icon size={28} strokeWidth={tab.active ? 2.5 : 1.75} fill={tab.active ? "var(--ht-navy)" : "none"} color={tab.active ? "white" : "var(--ht-ink-3)"} />
              <span style={{ fontSize: 10, fontWeight: 500 }}>{tab.label}</span>
            </div>
          ))}
        </div>
      </div>
    </MobileShell>
  );
}