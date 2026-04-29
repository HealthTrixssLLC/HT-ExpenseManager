import React, { useState } from "react";
import { 
  RefreshCw, 
  List, 
  Check, 
  AlertCircle, 
  Receipt,
  Search,
  LayoutDashboard,
  CheckSquare,
  Send,
  Banknote,
  FileBarChart,
  Cable,
  Settings,
  FileText
} from "lucide-react";
import { DesktopShell } from "./_shared/Shells";
import { DesktopTopbar } from "./_shared/BrandHeader";
import { Sidebar } from "./_shared/Sidebar";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function QuickBooksConnection() {
  const sidebarItems = [
    { label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { label: "Approvals", icon: <CheckSquare size={18} />, badge: 12 },
    { label: "Posting", icon: <Send size={18} /> },
    { label: "Payroll Queue", icon: <Banknote size={18} /> },
    { label: "Reconciliation", icon: <FileBarChart size={18} /> },
    { label: "Integrations", icon: <Cable size={18} />, active: true },
    { label: "Reports", icon: <FileText size={18} /> },
    { label: "Settings", icon: <Settings size={18} /> },
  ];

  const accounts = [
    { num: "6010", name: "Travel:Airfare", type: "Expense", receipt: 25, enabled: true },
    { num: "6020", name: "Travel:Lodging", type: "Expense", receipt: 25, enabled: true },
    { num: "6030", name: "Travel:Ground Transportation", type: "Expense", receipt: 25, enabled: true },
    { num: "6040", name: "Travel:Mileage", type: "Expense", receipt: "", enabled: false },
    { num: "6210", name: "Meals & Entertainment", type: "Expense", receipt: 75, enabled: true },
    { num: "6220", name: "Meals:Office", type: "Expense", receipt: "", enabled: false },
    { num: "6310", name: "Office Supplies", type: "Expense", receipt: 25, enabled: true },
    { num: "7100", name: "Software Subscriptions", type: "Expense", receipt: 25, enabled: true },
    { num: "7200", name: "Conferences & Trade Shows", type: "Expense", receipt: 25, enabled: true },
    { num: "7300", name: "Continuing Education", type: "Expense", receipt: 25, enabled: true },
  ];

  return (
    <DesktopShell width={1280} height={900}>
      <DesktopTopbar user="Hannah Sørensen" role="Accounting Admin" />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Sidebar items={sidebarItems} />
        <main style={{ flex: 1, padding: "32px 40px", overflowY: "auto", background: "var(--ht-canvas)" }}>
          <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>
            
            {/* Header */}
            <div>
              <div style={{ fontSize: 13, color: "var(--ht-ink-3)", fontWeight: 500, marginBottom: 4 }}>
                Integrations / Accounting
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--ht-ink)", letterSpacing: "-0.5px", margin: 0 }}>
                QuickBooks Online
              </h1>
            </div>

            {/* Connection Status Card */}
            <div className="ht-elev-1" style={{ background: "var(--ht-surface)", borderRadius: 12, border: "1px solid var(--ht-border)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                  <div style={{ width: 56, height: 56, borderRadius: 12, background: "var(--ht-tint-teal)", display: "grid", placeItems: "center", color: "var(--ht-teal)", fontSize: 20, fontWeight: 700, border: "1px solid var(--ht-border)" }}>
                    QB
                  </div>
                  <div style={{ display: "flex", gap: 48 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--ht-ink-3)", fontWeight: 500, marginBottom: 4 }}>Company</div>
                      <div style={{ fontSize: 14, color: "var(--ht-ink)", fontWeight: 600 }}>Healthtrix Inc.</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--ht-ink-3)", fontWeight: 500, marginBottom: 4 }}>Realm ID</div>
                      <div className="ht-mono" style={{ fontSize: 14, color: "var(--ht-ink)", fontWeight: 500 }}>9341098273645</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--ht-ink-3)", fontWeight: 500, marginBottom: 4 }}>Connected by</div>
                      <div style={{ fontSize: 14, color: "var(--ht-ink)", fontWeight: 500 }}>Hannah Sørensen</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--ht-ink-3)", fontWeight: 500, marginBottom: 4 }}>Last sync</div>
                      <div style={{ fontSize: 14, color: "var(--ht-ink)", fontWeight: 500 }}>Apr 29, 2026 · 11:42 AM <span style={{ color: "var(--ht-ink-3)" }}>(8m ago)</span></div>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--ht-tint-success)", color: "var(--ht-success)", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--ht-success)" }} />
                    Connected
                  </span>
                  <Button style={{ background: "var(--ht-navy)", color: "white" }} className="h-9 gap-2">
                    <RefreshCw size={14} /> Sync now
                  </Button>
                  <Button variant="ghost" className="h-9" style={{ color: "var(--ht-danger)" }}>
                    Disconnect
                  </Button>
                </div>
              </div>
              <div className="ht-divider" style={{ marginBottom: 16 }} />
              <div style={{ fontSize: 12, color: "var(--ht-ink-3)" }}>
                Token expires May 6, 2026 (auto-refreshed) · Scopes: com.intuit.quickbooks.accounting
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {[
                { label: "Chart of accounts", val: "286 active accounts", icon: <List size={16} /> },
                { label: "Categories enabled", val: "12 of 47", icon: <Check size={16} /> },
                { label: "Sync errors (last 24h)", val: "1", icon: <AlertCircle size={16} style={{ color: "var(--ht-warning)" }} /> },
                { label: "Posted entries this month", val: "38", icon: <Receipt size={16} /> },
              ].map((k, i) => (
                <div key={i} className="ht-elev-1" style={{ background: "var(--ht-surface)", borderRadius: 12, border: "1px solid var(--ht-border)", padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ht-ink-3)", marginBottom: 8, fontSize: 13, fontWeight: 500 }}>
                    {k.icon} {k.label}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ht-ink)" }}>{k.val}</div>
                </div>
              ))}
            </div>

            {/* Category Mapping */}
            <div style={{ display: "flex", gap: 32 }}>
              <div style={{ width: "35%", display: "flex", flexDirection: "column", gap: 24 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--ht-ink)", marginBottom: 8 }}>Category mapping</h2>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)", marginBottom: 4 }}>What employees can pick</h3>
                  <p style={{ fontSize: 13, color: "var(--ht-ink-2)", lineHeight: 1.5 }}>
                    Choose which QuickBooks expense accounts appear as categories on employee line items. Disabled accounts stay in QuickBooks but won't be selectable in this app. Changes take effect immediately.
                  </p>
                </div>
                
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ht-ink)", marginBottom: 8 }}>Default reimbursable account</div>
                  <div style={{ border: "1px solid var(--ht-border)", borderRadius: 6, padding: "8px 12px", background: "var(--ht-surface)", fontSize: 13, color: "var(--ht-ink)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="ht-mono">2400 · Employee Reimbursement Payable</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ht-ink-3)", marginTop: 6 }}>Used as the credit line on every posted journal entry.</div>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ht-ink)", marginBottom: 8 }}>Default class for unmapped lines</div>
                  <div style={{ border: "1px solid var(--ht-border)", borderRadius: 6, padding: "8px 12px", background: "var(--ht-surface)", fontSize: 13, color: "var(--ht-ink)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>(none)</span>
                  </div>
                </div>
              </div>

              <div className="ht-elev-1" style={{ width: "65%", background: "var(--ht-surface)", borderRadius: 12, border: "1px solid var(--ht-border)", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ht-border)", display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ position: "relative" }}>
                    <Search size={16} style={{ position: "absolute", left: 12, top: 10, color: "var(--ht-ink-3)" }} />
                    <Input placeholder="Search accounts…" style={{ paddingLeft: 36, height: 36, background: "var(--ht-canvas)", border: "1px solid var(--ht-border)", borderRadius: 6, fontSize: 13 }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
                      {["All (47)", "Enabled (12)", "Disabled (35)", "Travel (6)", "Meals (3)"].map((tag, i) => (
                        <span key={i} style={{ padding: "4px 10px", borderRadius: 999, background: i === 0 ? "var(--ht-tint-navy)" : "var(--ht-canvas)", color: i === 0 ? "var(--ht-navy)" : "var(--ht-ink-2)", fontSize: 12, fontWeight: i === 0 ? 600 : 500, border: i === 0 ? "none" : "1px solid var(--ht-border)" }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span style={{ fontSize: 13, color: "var(--ht-teal)", fontWeight: 500, cursor: "pointer" }}>Bulk enable…</span>
                  </div>
                </div>

                <div style={{ background: "var(--ht-surface)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--ht-border)", background: "var(--ht-canvas)" }}>
                        <th style={{ padding: "10px 20px", fontSize: 11, fontWeight: 600, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>Account</th>
                        <th style={{ padding: "10px 20px", fontSize: 11, fontWeight: 600, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>Type</th>
                        <th style={{ padding: "10px 20px", fontSize: 11, fontWeight: 600, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" }}>Receipt required ≥ $</th>
                        <th style={{ padding: "10px 20px", fontSize: 11, fontWeight: 600, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" }}>Enabled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((acc, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--ht-border)", opacity: acc.enabled ? 1 : 0.6, background: acc.enabled ? "transparent" : "var(--ht-surface-2)" }}>
                          <td style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
                            <span className="ht-mono" style={{ fontSize: 13, color: "var(--ht-ink-3)", width: 36 }}>{acc.num}</span>
                            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ht-ink)" }}>{acc.name}</span>
                          </td>
                          <td style={{ padding: "12px 20px" }}>
                            <span style={{ padding: "2px 6px", background: "var(--ht-canvas)", border: "1px solid var(--ht-border)", borderRadius: 4, fontSize: 11, color: "var(--ht-ink-2)" }}>{acc.type}</span>
                          </td>
                          <td style={{ padding: "12px 20px", textAlign: "right" }}>
                            <input 
                              type="text" 
                              value={acc.receipt} 
                              readOnly
                              disabled={!acc.enabled}
                              style={{ width: 48, textAlign: "right", padding: "4px 8px", border: "1px solid var(--ht-border)", borderRadius: 4, fontSize: 13, background: acc.enabled ? "var(--ht-surface)" : "transparent" }}
                              className="ht-mono"
                            />
                          </td>
                          <td style={{ padding: "12px 20px", textAlign: "right" }}>
                            <Switch checked={acc.enabled} className="data-[state=checked]:bg-[var(--ht-teal)]" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Recent sync activity */}
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--ht-ink)", marginBottom: 16 }}>Recent sync activity</h3>
              <div className="ht-elev-1" style={{ background: "var(--ht-surface)", borderRadius: 12, border: "1px solid var(--ht-border)", padding: "12px 0" }}>
                {[
                  { time: "Apr 29, 2026 11:42 AM", msg: "Synced 2 journal entries (EXP-2604-113, EXP-2604-114)", status: "success" },
                  { time: "Apr 29, 2026 09:18 AM", msg: "Refreshed chart of accounts (286 accounts)", status: "success" },
                  { time: "Apr 28, 2026 04:55 PM", msg: "Failed to post EXP-2604-099 (Account 6210 inactive)", status: "error", action: "Retry" },
                ].map((act, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", padding: "10px 24px", borderBottom: i < 2 ? "1px solid var(--ht-border)" : "none" }}>
                    <div style={{ width: 180, fontSize: 13, color: "var(--ht-ink-3)", fontWeight: 500 }}>{act.time}</div>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--ht-ink)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: act.status === "success" ? "var(--ht-success)" : "var(--ht-danger)" }} />
                      <span style={{ fontWeight: 500 }}>{act.msg}</span>
                      {act.action && <span style={{ color: "var(--ht-teal)", fontWeight: 600, cursor: "pointer", marginLeft: 8 }}>{act.action}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </main>
      </div>
    </DesktopShell>
  );
}
