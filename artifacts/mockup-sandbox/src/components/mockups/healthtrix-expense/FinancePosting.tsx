import React, { useState } from "react";
import {
  LayoutDashboard,
  Inbox,
  Send,
  CalendarDays,
  FileCheck,
  FileBarChart,
  Settings,
  CircleDollarSign,
  Wallet,
  AlertTriangle,
  RefreshCw,
  Download
} from "lucide-react";
import { DesktopShell } from "./_shared/Shells";
import { DesktopTopbar } from "./_shared/BrandHeader";
import { Sidebar } from "./_shared/Sidebar";
import { StatusPill } from "./_shared/StatusPill";
import { SAMPLE_REPORTS } from "./_shared/data";
import { Button } from "@/components/ui/button";

export function FinancePosting() {
  const sidebarItems = [
    { label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { label: "Approvals", icon: <Inbox size={18} /> },
    { label: "Posting", icon: <Send size={18} />, active: true, badge: "3" },
    { label: "Payroll Queue", icon: <CalendarDays size={18} /> },
    { label: "Reconciliation", icon: <FileCheck size={18} /> },
    { label: "Reports", icon: <FileBarChart size={18} /> },
    { label: "Settings", icon: <Settings size={18} /> },
  ];

  const postingReports = [
    { id: "EXP-2604-118", title: "HIMSS 2026 Conference — Las Vegas", employee: "Priya Raghavan", period: "Apr 14 — Apr 18", lines: 9, total: 2418.72 },
    { id: "EXP-2604-119", title: "Epic certification training", employee: "Diane Okafor", period: "Apr 06 — Apr 10", lines: 4, total: 1845.00 },
    { id: "EXP-2604-121", title: "Patient intake software pilot", employee: "Anika Bhatt", period: "Mar 23 — Mar 27", lines: 7, total: 449.40 },
  ];

  const payrollReports = [
    { id: "EXP-2604-117", employee: "Marcus Chen", posted: "Apr 25, 2026", period: "Apr 16 — Apr 30", total: 612.40 },
    { id: "EXP-2604-114", employee: "Jordan Whitfield", posted: "Apr 25, 2026", period: "Apr 16 — Apr 30", total: 1962.55 },
    { id: "EXP-2604-113", employee: "Anika Bhatt", posted: "Apr 25, 2026", period: "Apr 16 — Apr 30", total: 1140.88 },
    { id: "EXP-2604-112", employee: "Wesley Park", posted: "Apr 24, 2026", period: "Apr 16 — Apr 30", total: 824.10 },
    { id: "EXP-2604-111", employee: "Rosa Delacruz", posted: "Apr 22, 2026", period: "Apr 16 — Apr 30", total: 3247.40 },
  ];

  const reconRows = [
    { id: "EXP-2603-098", employee: "Sarah Jenkins", approved: 450.00, paid: 450.00, variance: 0, status: "Reconciled" },
    { id: "EXP-2603-097", employee: "Michael Chang", approved: 1250.50, paid: 1250.50, variance: 0, status: "Reconciled" },
    { id: "EXP-2603-096", employee: "Emily Rostova", approved: 890.20, paid: 847.70, variance: -42.50, status: "Sync Error" },
    { id: "EXP-2603-095", employee: "David Kim", approved: 320.00, paid: 325.00, variance: 5.00, status: "Sync Error" },
    { id: "EXP-2603-094", employee: "Aisha Patel", approved: 610.75, paid: null, variance: -610.75, status: "Sync Error" },
    { id: "EXP-2603-093", employee: "Tom Wilson", approved: 215.00, paid: 215.00, variance: 0, status: "Reconciled" },
  ];

  const [activeTab, setActiveTab] = useState("Post");

  return (
    <DesktopShell width={1280} height={900}>
      <DesktopTopbar user="Rosa Delacruz" role="Finance Approver" />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar items={sidebarItems} />
        
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--ht-canvas)" }}>
          
          {/* Header Area */}
          <div style={{ padding: "32px 40px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--ht-navy)", margin: "0 0 6px 0" }}>Finance workspace</h1>
                <div style={{ fontSize: 14, color: "var(--ht-ink-3)" }}>Approve, post to QuickBooks, and reconcile payroll reimbursements</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "white", padding: "6px 12px", borderRadius: 999, border: "1px solid var(--ht-border)", fontSize: 12, fontWeight: 500, color: "var(--ht-ink-2)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--ht-success)" }} />
                  Connected · last sync 8 min ago
                </div>
                <Button size="sm" variant="outline" style={{ gap: 6, background: "white" }}>
                  <RefreshCw size={14} /> Sync now
                </Button>
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display: "flex", gap: 16, marginBottom: 32 }}>
              <div className="ht-elev-1" style={{ flex: 1, background: "white", padding: 20, borderRadius: 12, border: "1px solid var(--ht-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, color: "var(--ht-ink-2)", fontSize: 13, fontWeight: 500 }}>
                  <CircleDollarSign size={16} color="var(--ht-navy)" /> Pending posting
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <div className="ht-mono ht-tabular" style={{ fontSize: 28, fontWeight: 600, color: "var(--ht-navy)" }}>$4,256.95</div>
                  <div style={{ fontSize: 14, color: "var(--ht-ink-3)" }}>3 reports</div>
                </div>
              </div>
              <div className="ht-elev-1" style={{ flex: 1, background: "white", padding: 20, borderRadius: 12, border: "1px solid var(--ht-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, color: "var(--ht-ink-2)", fontSize: 13, fontWeight: 500 }}>
                  <Wallet size={16} color="var(--ht-teal)" /> Ready for payroll
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <div className="ht-mono ht-tabular" style={{ fontSize: 28, fontWeight: 600, color: "var(--ht-navy)" }}>$7,612.30</div>
                  <div style={{ fontSize: 14, color: "var(--ht-ink-3)" }}>5 reports</div>
                </div>
              </div>
              <div className="ht-elev-1" style={{ flex: 1, background: "white", padding: 20, borderRadius: 12, border: "1px solid var(--ht-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, color: "var(--ht-ink-2)", fontSize: 13, fontWeight: 500 }}>
                  <AlertTriangle size={16} color="var(--ht-orange)" /> Variances open
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <div className="ht-mono ht-tabular" style={{ fontSize: 28, fontWeight: 600, color: "var(--ht-navy)" }}>2</div>
                  <div className="ht-mono" style={{ fontSize: 14, color: "var(--ht-warning)" }}>($168.40)</div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 32, borderBottom: "1px solid var(--ht-border)", marginBottom: 24 }}>
              <button 
                onClick={() => setActiveTab("Post")}
                style={{ background: "none", border: "none", padding: "0 0 12px 0", fontSize: 14, fontWeight: 600, color: activeTab === "Post" ? "var(--ht-navy)" : "var(--ht-ink-3)", borderBottom: activeTab === "Post" ? "2px solid var(--ht-navy)" : "2px solid transparent", cursor: "pointer" }}>
                Post to QuickBooks (3)
              </button>
              <button 
                onClick={() => setActiveTab("Payroll")}
                style={{ background: "none", border: "none", padding: "0 0 12px 0", fontSize: 14, fontWeight: 600, color: activeTab === "Payroll" ? "var(--ht-navy)" : "var(--ht-ink-3)", borderBottom: activeTab === "Payroll" ? "2px solid var(--ht-navy)" : "2px solid transparent", cursor: "pointer" }}>
                Payroll batch (5)
              </button>
              <button 
                onClick={() => setActiveTab("Recon")}
                style={{ background: "none", border: "none", padding: "0 0 12px 0", fontSize: 14, fontWeight: 600, color: activeTab === "Recon" ? "var(--ht-navy)" : "var(--ht-ink-3)", borderBottom: activeTab === "Recon" ? "2px solid var(--ht-navy)" : "2px solid transparent", cursor: "pointer" }}>
                Reconciliation (12)
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 40px 40px" }}>
            {activeTab === "Post" && (
              <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                {/* Post Table */}
                <div style={{ flex: "6 1 0%", background: "white", borderRadius: 12, border: "1px solid var(--ht-border)", overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ht-border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--ht-surface-2)" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button size="sm" style={{ background: "var(--ht-navy)", color: "white" }}>Post selected (1)</Button>
                      <Button size="sm" variant="outline" style={{ background: "white" }}>Schedule...</Button>
                    </div>
                    <Button size="sm" variant="ghost" style={{ color: "var(--ht-ink-2)" }}><Download size={14} className="mr-2" /> Export GL preview</Button>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--ht-border)", color: "var(--ht-ink-3)", background: "white" }}>
                        <th style={{ padding: "12px 16px", width: 40 }}><input type="checkbox" checked readOnly style={{ accentColor: "var(--ht-navy)" }} /></th>
                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Report</th>
                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Employee</th>
                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Period</th>
                        <th style={{ padding: "12px 16px", fontWeight: 500, textAlign: "center" }}>Lines</th>
                        <th style={{ padding: "12px 16px", fontWeight: 500, textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {postingReports.map((r, i) => (
                        <tr key={r.id} style={{ borderBottom: "1px solid var(--ht-border)", background: i === 0 ? "var(--ht-tint-navy)" : "white" }}>
                          <td style={{ padding: "16px" }}><input type="checkbox" checked={i === 0} readOnly style={{ accentColor: "var(--ht-navy)" }} /></td>
                          <td style={{ padding: "16px" }}>
                            <div style={{ fontWeight: 600, color: "var(--ht-ink)", marginBottom: 4 }}>{r.title}</div>
                            <div className="ht-mono" style={{ fontSize: 11, color: "var(--ht-ink-3)" }}>{r.id}</div>
                          </td>
                          <td style={{ padding: "16px", color: "var(--ht-ink-2)" }}>{r.employee}</td>
                          <td style={{ padding: "16px", color: "var(--ht-ink-2)" }}>{r.period}</td>
                          <td style={{ padding: "16px", textAlign: "center", color: "var(--ht-ink-3)" }}>{r.lines}</td>
                          <td className="ht-mono ht-tabular" style={{ padding: "16px", textAlign: "right", fontWeight: 600, color: "var(--ht-navy)" }}>
                            ${r.total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* GL Preview */}
                <div style={{ flex: "4 1 0%", background: "white", borderRadius: 12, border: "1px solid var(--ht-border)", display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ht-border)", fontWeight: 600, fontSize: 14 }}>
                    GL entry preview
                  </div>
                  <div style={{ padding: 20 }}>
                    <table style={{ width: "100%", fontSize: 12, fontFamily: '"IBM Plex Mono", monospace' }}>
                      <thead>
                        <tr style={{ color: "var(--ht-ink-3)", textAlign: "left" }}>
                          <th style={{ paddingBottom: 12, fontWeight: 500 }}>Account</th>
                          <th style={{ paddingBottom: 12, fontWeight: 500, textAlign: "right" }}>Debit</th>
                          <th style={{ paddingBottom: 12, fontWeight: 500, textAlign: "right" }}>Credit</th>
                        </tr>
                      </thead>
                      <tbody style={{ color: "var(--ht-ink)" }}>
                        <tr><td style={{ padding: "4px 0" }}>6010 · Travel:Airfare</td><td style={{ textAlign: "right" }}>612.40</td><td style={{ textAlign: "right" }}></td></tr>
                        <tr><td style={{ padding: "4px 0" }}>6020 · Travel:Lodging</td><td style={{ textAlign: "right" }}>1,042.00</td><td style={{ textAlign: "right" }}></td></tr>
                        <tr><td style={{ padding: "4px 0" }}>6030 · Travel:Ground Trans</td><td style={{ textAlign: "right" }}>90.60</td><td style={{ textAlign: "right" }}></td></tr>
                        <tr><td style={{ padding: "4px 0" }}>6210 · Meals & Ent</td><td style={{ textAlign: "right" }}>207.47</td><td style={{ textAlign: "right" }}></td></tr>
                        <tr><td style={{ padding: "4px 0" }}>6310 · Office Supplies</td><td style={{ textAlign: "right" }}>41.25</td><td style={{ textAlign: "right" }}></td></tr>
                        <tr><td style={{ padding: "4px 0", paddingBottom: 16 }}>7200 · Conferences</td><td style={{ textAlign: "right", paddingBottom: 16 }}>425.00</td><td style={{ textAlign: "right", paddingBottom: 16 }}></td></tr>
                        <tr>
                          <td colSpan={3} style={{ padding: 0 }}>
                            <div style={{ borderLeft: "2px solid var(--ht-teal)", paddingLeft: 10, margin: "4px 0" }}>
                              <table style={{ width: "100%" }}>
                                <tbody>
                                  <tr style={{ fontWeight: 600, color: "var(--ht-navy)" }}>
                                    <td>2400 · Employee Reimb Payable</td>
                                    <td style={{ textAlign: "right", width: "33%" }}></td>
                                    <td style={{ textAlign: "right", width: "33%" }}>2,418.72</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div style={{ marginTop: 24, padding: "12px", background: "var(--ht-surface-2)", borderRadius: 6, border: "1px solid var(--ht-border)" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ht-ink)", marginBottom: 4 }}>Memo · EXP-2604-118 — Priya Raghavan — HIMSS 2026</div>
                      <div style={{ fontSize: 11, color: "var(--ht-ink-3)" }}>Posting will create one balanced journal entry in QuickBooks Online (realm 9341098273645)</div>
                    </div>

                    <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                      <Button style={{ background: "var(--ht-navy)", color: "white" }}>Post to QuickBooks</Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "Payroll" && (
              <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
                <div style={{ flex: "6 1 0%", background: "white", borderRadius: 12, border: "1px solid var(--ht-border)", overflow: "hidden" }}>
                   <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--ht-border)", color: "var(--ht-ink-3)", background: "var(--ht-surface-2)" }}>
                        <th style={{ padding: "12px 16px", width: 40 }}><input type="checkbox" checked readOnly style={{ accentColor: "var(--ht-navy)" }} /></th>
                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Report</th>
                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Employee</th>
                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Posted on</th>
                        <th style={{ padding: "12px 16px", fontWeight: 500 }}>Pay period</th>
                        <th style={{ padding: "12px 16px", fontWeight: 500, textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollReports.map((r, i) => (
                        <tr key={r.id} style={{ borderBottom: "1px solid var(--ht-border)", background: "white" }}>
                          <td style={{ padding: "16px" }}><input type="checkbox" checked readOnly style={{ accentColor: "var(--ht-navy)" }} /></td>
                          <td style={{ padding: "16px" }}>
                            <div className="ht-mono" style={{ fontSize: 12, color: "var(--ht-ink)" }}>{r.id}</div>
                          </td>
                          <td style={{ padding: "16px", color: "var(--ht-ink-2)", fontWeight: 500 }}>{r.employee}</td>
                          <td style={{ padding: "16px", color: "var(--ht-ink-3)" }}>{r.posted}</td>
                          <td style={{ padding: "16px", color: "var(--ht-ink-3)" }}>{r.period}</td>
                          <td className="ht-mono ht-tabular" style={{ padding: "16px", textAlign: "right", fontWeight: 600, color: "var(--ht-navy)" }}>
                            ${r.total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ flex: "4 1 0%", background: "white", borderRadius: 12, border: "1px solid var(--ht-border)", padding: 24 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ht-navy)", marginBottom: 16 }}>Batch: April 30 paychecks</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span style={{ color: "var(--ht-ink-2)" }}>Reports included</span>
                      <span style={{ fontWeight: 600 }}>5</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span style={{ color: "var(--ht-ink-2)" }}>Employees</span>
                      <span style={{ fontWeight: 600 }}>5</span>
                    </div>
                    <div style={{ height: 1, background: "var(--ht-border)" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16 }}>
                      <span style={{ color: "var(--ht-ink-2)", fontWeight: 500 }}>Total Reimbursement</span>
                      <span className="ht-mono ht-tabular" style={{ fontWeight: 700, color: "var(--ht-navy)" }}>$7,612.30</span>
                    </div>
                  </div>
                  <Button style={{ width: "100%", background: "var(--ht-navy)", color: "white", marginBottom: 12 }}>Mark as paid through payroll</Button>
                  <p style={{ fontSize: 12, color: "var(--ht-ink-3)", textAlign: "center", margin: 0, lineHeight: 1.4 }}>
                    After the paychecks run, mark as paid and finance can reconcile.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "Recon" && (
              <div style={{ background: "white", borderRadius: 12, border: "1px solid var(--ht-border)", overflow: "hidden" }}>
                 <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--ht-border)", color: "var(--ht-ink-3)", background: "var(--ht-surface-2)" }}>
                      <th style={{ padding: "12px 20px", fontWeight: 500 }}>Report</th>
                      <th style={{ padding: "12px 20px", fontWeight: 500 }}>Employee</th>
                      <th style={{ padding: "12px 20px", fontWeight: 500, textAlign: "right" }}>Approved</th>
                      <th style={{ padding: "12px 20px", fontWeight: 500, textAlign: "right" }}>Paid</th>
                      <th style={{ padding: "12px 20px", fontWeight: 500, textAlign: "right" }}>Variance</th>
                      <th style={{ padding: "12px 20px", fontWeight: 500 }}>Status</th>
                      <th style={{ padding: "12px 20px", fontWeight: 500 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconRows.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--ht-border)", background: r.variance !== 0 ? "var(--ht-tint-danger)" : "white" }}>
                        <td style={{ padding: "16px 20px" }}>
                          <div className="ht-mono" style={{ fontSize: 13, color: "var(--ht-ink)", fontWeight: 500 }}>{r.id}</div>
                        </td>
                        <td style={{ padding: "16px 20px", color: "var(--ht-ink-2)" }}>{r.employee}</td>
                        <td className="ht-mono ht-tabular" style={{ padding: "16px 20px", textAlign: "right", color: "var(--ht-ink)" }}>
                          ${r.approved.toFixed(2)}
                        </td>
                        <td className="ht-mono ht-tabular" style={{ padding: "16px 20px", textAlign: "right", color: r.paid === null ? "var(--ht-danger)" : "var(--ht-ink)" }}>
                          {r.paid !== null ? `$${r.paid.toFixed(2)}` : "—"}
                        </td>
                        <td className="ht-mono ht-tabular" style={{ padding: "16px 20px", textAlign: "right", fontWeight: r.variance !== 0 ? 600 : 400, color: r.variance < 0 ? "var(--ht-danger)" : r.variance > 0 ? "var(--ht-warning)" : "var(--ht-success)" }}>
                          {r.variance !== 0 ? (r.variance > 0 ? `+$${r.variance.toFixed(2)}` : `-$${Math.abs(r.variance).toFixed(2)}`) : "$0.00"}
                        </td>
                        <td style={{ padding: "16px 20px" }}>
                          <StatusPill status={r.status as any} size="xs" />
                        </td>
                        <td style={{ padding: "16px 20px", textAlign: "right" }}>
                          {r.variance !== 0 && (
                            <button style={{ background: "none", border: "none", color: "var(--ht-navy)", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                              Resolve
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </DesktopShell>
  );
}
