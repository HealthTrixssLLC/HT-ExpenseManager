import React, { useState } from "react";
import {
  LayoutDashboard,
  Inbox,
  ClipboardCheck,
  Users,
  Building2,
  FileBarChart,
  Search,
  Calendar,
  Check,
  Paperclip,
  AlertCircle,
  MoreHorizontal
} from "lucide-react";
import { DesktopShell } from "./_shared/Shells";
import { DesktopTopbar } from "./_shared/BrandHeader";
import { Sidebar } from "./_shared/Sidebar";
import { StatusPill } from "./_shared/StatusPill";
import { StatusTracker } from "./_shared/StatusTracker";
import { SAMPLE_REPORTS, HIMSS_LINES } from "./_shared/data";
import { Button } from "@/components/ui/button";

export function ManagerReview() {
  const sidebarItems = [
    { label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { label: "Approvals", icon: <Inbox size={18} />, active: true, badge: "7" },
    { label: "My Reviews", icon: <ClipboardCheck size={18} /> },
    { label: "Team", icon: <Users size={18} /> },
    { label: "Departments", icon: <Building2 size={18} /> },
    { label: "Reports", icon: <FileBarChart size={18} /> },
  ];

  const queueReports = SAMPLE_REPORTS.filter(
    (r) => r.status === "Manager Review" || r.status === "Changes Requested"
  );

  return (
    <DesktopShell width={1280} height={900}>
      <DesktopTopbar user="Marcus Chen" role="Manager Approver" />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar items={sidebarItems} />
        
        {/* Main Area Split Pane */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          
          {/* Left Pane - Queue */}
          <div
            style={{
              width: 460,
              flexShrink: 0,
              borderRight: "1px solid var(--ht-border)",
              background: "var(--ht-surface-2)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--ht-border)", background: "var(--ht-surface)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--ht-navy)", margin: 0 }}>Approval queue</h1>
                <span style={{ fontSize: 13, color: "var(--ht-ink-3)", fontWeight: 500 }}>7 awaiting</span>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 20, fontSize: 14, fontWeight: 500 }}>
                  <span style={{ color: "var(--ht-navy)", borderBottom: "2px solid var(--ht-navy)", paddingBottom: 4 }}>Awaiting me (7)</span>
                  <span style={{ color: "var(--ht-ink-3)", paddingBottom: 4, cursor: "pointer" }}>Watching</span>
                  <span style={{ color: "var(--ht-ink-3)", paddingBottom: 4, cursor: "pointer" }}>All</span>
                </div>
              </div>
              
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "var(--ht-ink-3)" }} />
                  <input 
                    type="text" 
                    placeholder="Search reports..." 
                    style={{ 
                      width: "100%", 
                      height: 32, 
                      paddingLeft: 30, 
                      borderRadius: 6, 
                      border: "1px solid var(--ht-border)",
                      fontSize: 13,
                      background: "var(--ht-canvas)"
                    }} 
                  />
                </div>
              </div>
            </div>

            <div style={{ padding: "12px 24px", display: "flex", gap: 8, alignItems: "center", borderBottom: "1px solid var(--ht-border)" }}>
              <span style={{ fontSize: 12, color: "var(--ht-ink-3)", fontWeight: 500 }}>Sort: Aging</span>
              <span style={{ fontSize: 12, background: "white", border: "1px solid var(--ht-border-strong)", padding: "2px 8px", borderRadius: 999, fontWeight: 500, color: "var(--ht-ink-2)" }}>Aging &gt; 5d (3)</span>
              <span style={{ fontSize: 12, background: "white", border: "1px solid var(--ht-border)", padding: "2px 8px", borderRadius: 999, fontWeight: 500, color: "var(--ht-ink-2)" }}>Over $1k (2)</span>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {queueReports.map((report) => {
                const isSelected = report.id === "EXP-2604-118";
                return (
                  <div
                    key={report.id}
                    style={{
                      padding: 16,
                      background: isSelected ? "var(--ht-surface)" : "var(--ht-surface)",
                      borderRadius: 8,
                      border: isSelected ? "1px solid var(--ht-border-strong)" : "1px solid var(--ht-border)",
                      borderLeft: isSelected ? "3px solid var(--ht-orange)" : "1px solid var(--ht-border)",
                      boxShadow: isSelected ? "0 2px 8px rgba(20,35,59,0.06)" : "0 1px 2px rgba(20,35,59,0.02)",
                      cursor: "pointer",
                      position: "relative"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ht-ink)" }}>{report.title}</div>
                      <div className="ht-mono" style={{ fontWeight: 600, fontSize: 14, color: "var(--ht-ink)" }}>
                        ${report.total.toFixed(2)}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ fontSize: 13, color: "var(--ht-ink-2)" }}>
                        {report.employee} <span style={{ color: "var(--ht-ink-3)" }}>· {report.department}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <StatusPill status={report.status} size="xs" />
                        <span className="ht-mono" style={{ fontSize: 11, color: "var(--ht-ink-3)" }}>{report.id}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: report.ageDays > 14 ? "var(--ht-danger)" : report.ageDays > 5 ? "var(--ht-warning)" : "var(--ht-ink-3)", fontWeight: 500 }}>
                        <Calendar size={12} />
                        {report.ageDays}d
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Pane - Detail */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--ht-surface)", overflow: "hidden" }}>
            <div style={{ padding: "24px 32px 0", borderBottom: "1px solid var(--ht-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 600, color: "var(--ht-navy)", margin: "0 0 8px 0" }}>HIMSS 2026 Conference — Las Vegas</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="ht-mono" style={{ fontSize: 13, color: "var(--ht-ink-2)", fontWeight: 500 }}>EXP-2604-118</span>
                    <StatusPill status="Manager Review" size="sm" />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Button variant="secondary" size="sm" style={{ background: "var(--ht-surface-2)", color: "var(--ht-ink-2)", border: "1px solid var(--ht-border)" }}>Request changes</Button>
                  <Button variant="ghost" size="sm" style={{ color: "var(--ht-danger)" }}>Reject</Button>
                  <Button size="sm" style={{ background: "var(--ht-navy)", color: "white" }}>
                    <Check size={16} className="mr-2" /> Approve
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="More actions" style={{ color: "var(--ht-ink-3)" }}><MoreHorizontal size={18} /></Button>
                </div>
              </div>

              <div style={{ display: "flex", background: "var(--ht-surface-2)", border: "1px solid var(--ht-border)", borderRadius: 8, padding: "12px 20px", marginBottom: 24 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>Employee</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ht-ink)" }}>Priya Raghavan</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>Department</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ht-ink)" }}>Clinical Operations</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>Period</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ht-ink)" }}>Apr 14–18, 2026</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>Total</div>
                  <div className="ht-mono ht-tabular" style={{ fontSize: 16, fontWeight: 600, color: "var(--ht-navy)" }}>$2,418.72</div>
                </div>
              </div>

              <div style={{ marginBottom: 24, padding: "0 10px" }}>
                <StatusTracker current="Manager Review" variant="horizontal" />
              </div>

              <div style={{ display: "flex", gap: 24, fontSize: 14, fontWeight: 500 }}>
                <span style={{ color: "var(--ht-navy)", borderBottom: "2px solid var(--ht-navy)", paddingBottom: 12 }}>Line items (9)</span>
                <span style={{ color: "var(--ht-ink-3)", paddingBottom: 12, cursor: "pointer" }}>Receipts (8)</span>
                <span style={{ color: "var(--ht-ink-3)", paddingBottom: 12, cursor: "pointer" }}>Approvals</span>
                <span style={{ color: "var(--ht-ink-3)", paddingBottom: 12, cursor: "pointer" }}>Comments</span>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--ht-border)", color: "var(--ht-ink-3)" }}>
                    <th style={{ padding: "8px 12px 8px 0", fontWeight: 500, width: 60 }}>Date</th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>Merchant</th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>Description</th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>QB Category</th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>Method</th>
                    <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "center" }}>Receipt</th>
                    <th style={{ padding: "8px 0 8px 12px", fontWeight: 500, textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {HIMSS_LINES.map((line, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--ht-border)", color: "var(--ht-ink)" }}>
                      <td style={{ padding: "12px 12px 12px 0", color: "var(--ht-ink-2)" }}>{line.date}</td>
                      <td style={{ padding: "12px" }}>{line.merchant}</td>
                      <td style={{ padding: "12px", color: "var(--ht-ink-2)" }}>{line.description}</td>
                      <td style={{ padding: "12px" }}>
                        <span style={{ background: "var(--ht-canvas)", padding: "2px 6px", borderRadius: 4, fontSize: 12, border: "1px solid var(--ht-border)" }}>
                          {line.category}
                        </span>
                      </td>
                      <td style={{ padding: "12px", color: "var(--ht-ink-2)" }}>{line.paymentMethod}</td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        {line.hasReceipt ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--ht-ink-3)" }}>
                            <Paperclip size={14} /> {line.receipts || 1}
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--ht-warning)", fontSize: 11, fontWeight: 600, background: "var(--ht-tint-orange)", padding: "2px 6px", borderRadius: 4 }}>
                            <AlertCircle size={12} /> Missing
                          </span>
                        )}
                      </td>
                      <td className="ht-mono ht-tabular" style={{ padding: "12px 0 12px 12px", textAlign: "right", fontWeight: 500 }}>
                        ${line.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600, fontSize: 14 }}>
                    <td colSpan={6} style={{ padding: "16px 12px 16px 0", textAlign: "right", color: "var(--ht-ink-2)" }}>Total</td>
                    <td className="ht-mono ht-tabular" style={{ padding: "16px 0 16px 12px", textAlign: "right", color: "var(--ht-navy)" }}>$2,418.72</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ marginTop: 32, background: "var(--ht-canvas)", border: "1px solid var(--ht-border)", borderRadius: 8, padding: 20 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ht-ink)", marginBottom: 8 }}>Comment to employee (optional)</label>
                <textarea 
                  placeholder="e.g. Approved — please attach the missing Starbucks receipt before resubmitting next time."
                  style={{ 
                    width: "100%", 
                    height: 80, 
                    padding: 12, 
                    borderRadius: 6, 
                    border: "1px solid var(--ht-border)", 
                    fontSize: 13,
                    fontFamily: "inherit",
                    resize: "none",
                    marginBottom: 12
                  }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ht-ink-2)", cursor: "pointer" }}>
                  <input type="checkbox" style={{ width: 16, height: 16, accentColor: "var(--ht-navy)" }} />
                  Apply policy reminder
                </label>
              </div>
            </div>

            <div style={{ padding: "16px 32px", borderTop: "1px solid var(--ht-border)", background: "var(--ht-surface)", display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <Button variant="ghost" style={{ color: "var(--ht-danger)" }}>Reject</Button>
              <Button variant="secondary" style={{ background: "var(--ht-surface-2)", color: "var(--ht-ink-2)", border: "1px solid var(--ht-border)" }}>Request changes</Button>
              <Button style={{ background: "var(--ht-navy)", color: "white" }}>
                <Check size={16} className="mr-2" /> Approve
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DesktopShell>
  );
}
