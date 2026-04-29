import {
  LayoutDashboard,
  Inbox,
  ClipboardCheck,
  Users,
  Building2,
  FileBarChart,
  Settings,
  Plane,
  CalendarRange,
  ArrowRight,
  Plus,
  ChevronDown,
  Check,
  X as XIcon,
  History,
  Info,
  ShieldAlert,
} from "lucide-react";
import { DesktopShell } from "./_shared/Shells";
import { DesktopTopbar } from "./_shared/BrandHeader";
import { Sidebar } from "./_shared/Sidebar";
import { StatusPill } from "./_shared/StatusPill";

type Delegation = {
  id: string;
  delegator: string;
  delegatorRole: "Manager Approver" | "Finance Approver";
  team: string;
  startDate: string;
  endDate: string;
  scope: string;
  pendingCount: number;
  pendingTotal: number;
};

const DELEGATIONS_TO_ME: Delegation[] = [
  {
    id: "del-2611",
    delegator: "Sandra Mehta",
    delegatorRole: "Manager Approver",
    team: "Revenue Cycle · West",
    startDate: "Apr 27, 2026",
    endDate: "May 04, 2026",
    scope: "All expense reports",
    pendingCount: 4,
    pendingTotal: 2148.62,
  },
  {
    id: "del-2607",
    delegator: "Daniel O'Brien",
    delegatorRole: "Manager Approver",
    team: "IT & Security",
    startDate: "Apr 22, 2026",
    endDate: "Apr 30, 2026",
    scope: "Reports up to $1,500",
    pendingCount: 2,
    pendingTotal: 612.40,
  },
];

type AuditEntry = {
  when: string;
  who: string;
  action: string;
  detail: string;
};

const AUDIT: AuditEntry[] = [
  { when: "Apr 28 · 9:14 am", who: "Marcus Chen",     action: "Started delegation",      detail: "Backup approver: Aliyah Brooks · May 04 → May 12" },
  { when: "Apr 27 · 4:02 pm", who: "Sandra Mehta",    action: "Started delegation",      detail: "Backup approver: Marcus Chen · Apr 27 → May 04" },
  { when: "Apr 22 · 8:31 am", who: "Daniel O'Brien",  action: "Started delegation",      detail: "Backup approver: Marcus Chen · Apr 22 → Apr 30 · cap $1,500" },
  { when: "Apr 19 · 5:45 pm", who: "Julia Reinhardt", action: "Ended delegation early",  detail: "Returned from PTO, all pending items reassigned to her" },
  { when: "Apr 12 · 2:10 pm", who: "Marcus Chen",     action: "Approved on behalf of",   detail: "EXP-2604-099 · Sandra Mehta · $487.20" },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "var(--ht-ink-3)",
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function Field({
  children,
  width,
  trailing,
}: {
  children: React.ReactNode;
  width?: number | string;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      style={{
        height: 38,
        background: "var(--ht-surface)",
        border: "1px solid var(--ht-border)",
        borderRadius: 8,
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        width,
        fontSize: 13,
        color: "var(--ht-ink)",
      }}
    >
      <span style={{ flex: 1 }}>{children}</span>
      {trailing}
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      style={{
        width: 40,
        height: 22,
        borderRadius: 999,
        background: on ? "var(--ht-navy)" : "var(--ht-border-strong)",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: "white",
          boxShadow: "0 1px 3px rgba(20,35,59,0.25)",
        }}
      />
    </span>
  );
}

export function ApproverDelegation() {
  const sidebarItems = [
    { label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { label: "Approvals", icon: <Inbox size={18} />, badge: "11" },
    { label: "My Reviews", icon: <ClipboardCheck size={18} /> },
    { label: "Team", icon: <Users size={18} /> },
    { label: "Departments", icon: <Building2 size={18} /> },
    { label: "Reports", icon: <FileBarChart size={18} /> },
    { label: "Delegation", icon: <Plane size={18} />, active: true },
    { label: "Settings", icon: <Settings size={18} /> },
  ];

  return (
    <DesktopShell width={1280} height={900}>
      <DesktopTopbar user="Marcus Chen" role="Manager Approver" />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar items={sidebarItems} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--ht-canvas)" }}>
          {/* Page header */}
          <div style={{ padding: "28px 40px 0" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--ht-ink-3)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
                  Settings · Delegation
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--ht-navy)", margin: "0 0 6px 0", letterSpacing: -0.3 }}>
                  Out-of-office &amp; backup approvers
                </h1>
                <div style={{ fontSize: 14, color: "var(--ht-ink-3)" }}>
                  Hand off your approval queue while traveling, and see whose queue you are covering.
                </div>
              </div>

              {/* Status banner */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: "var(--ht-tint-success)",
                  color: "var(--ht-success)",
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "1px solid #B5D6C6",
                  maxWidth: 420,
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--ht-success)", flexShrink: 0 }} />
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                  <div style={{ fontWeight: 700 }}>You are currently in office</div>
                  <div style={{ color: "#386B57", fontWeight: 500 }}>Approvals are routed to you as normal.</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 40px 40px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "flex-start" }}>
              {/* Left column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* I'm delegating card */}
                <div className="ht-elev-1" style={{ background: "var(--ht-surface)", borderRadius: 12, border: "1px solid var(--ht-border)" }}>
                  <div style={{ padding: "20px 24px 18px", borderBottom: "1px solid var(--ht-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ht-ink)" }}>I&apos;m delegating</div>
                      <div style={{ fontSize: 12, color: "var(--ht-ink-3)", marginTop: 4 }}>
                        Schedule a backup approver for an upcoming trip or PTO.
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 13, color: "var(--ht-ink-2)", fontWeight: 500 }}>Out of office</span>
                      <Toggle on />
                    </div>
                  </div>

                  <div style={{ padding: "20px 24px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                      <div>
                        <FieldLabel>Date range</FieldLabel>
                        <Field trailing={<CalendarRange size={14} color="var(--ht-ink-3)" />}>
                          May 04, 2026 → May 12, 2026 · 9 days
                        </Field>
                      </div>
                      <div>
                        <FieldLabel>Reason (visible to backup)</FieldLabel>
                        <Field>HIMSS executive briefing in Chicago</Field>
                      </div>

                      <div>
                        <FieldLabel>Backup approver</FieldLabel>
                        <Field trailing={<ChevronDown size={14} color="var(--ht-ink-3)" />}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 999,
                                background: "var(--ht-tint-teal)",
                                color: "var(--ht-teal)",
                                display: "grid",
                                placeItems: "center",
                                fontSize: 10,
                                fontWeight: 700,
                              }}
                            >
                              AB
                            </span>
                            Aliyah Brooks · Sr. Manager, Revenue Cycle
                          </span>
                        </Field>
                      </div>

                      <div>
                        <FieldLabel>Approval scope</FieldLabel>
                        <Field trailing={<ChevronDown size={14} color="var(--ht-ink-3)" />}>
                          All expense reports up to $2,500
                        </Field>
                      </div>
                    </div>

                    {/* Permissions checkboxes */}
                    <div style={{ marginBottom: 20 }}>
                      <FieldLabel>What can the backup do?</FieldLabel>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        {[
                          { label: "Approve reports within scope", on: true },
                          { label: "Request changes from employees", on: true },
                          { label: "Reject reports", on: true },
                          { label: "Reassign approvals to a different manager", on: false },
                        ].map((perm) => (
                          <label
                            key={perm.label}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "10px 12px",
                              border: "1px solid var(--ht-border)",
                              borderRadius: 8,
                              fontSize: 13,
                              color: "var(--ht-ink-2)",
                              fontWeight: 500,
                              background: "var(--ht-surface-2)",
                            }}
                          >
                            <span
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: 5,
                                border: perm.on ? "none" : "1.5px solid var(--ht-border-strong)",
                                background: perm.on ? "var(--ht-navy)" : "var(--ht-surface)",
                                display: "grid",
                                placeItems: "center",
                                color: "white",
                                flexShrink: 0,
                              }}
                            >
                              {perm.on && <Check size={12} strokeWidth={3} />}
                            </span>
                            {perm.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Auto-message preview */}
                    <div
                      style={{
                        background: "var(--ht-canvas)",
                        border: "1px dashed var(--ht-border-strong)",
                        borderRadius: 8,
                        padding: "12px 14px",
                        display: "flex",
                        gap: 10,
                        marginBottom: 20,
                      }}
                    >
                      <Info size={16} color="var(--ht-teal)" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ht-ink-2)" }}>
                        Employees who submit a report between <strong>May 4 — May 12</strong> will see an in-app note:
                        &ldquo;Marcus Chen is out of office; Aliyah Brooks is reviewing in his place.&rdquo; Email + Slack
                        notifications will be sent to Aliyah for each new submission.
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                      <button
                        style={{
                          background: "transparent",
                          color: "var(--ht-ink-2)",
                          border: "1px solid var(--ht-border)",
                          padding: "8px 16px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        style={{
                          background: "var(--ht-navy)",
                          color: "white",
                          border: "none",
                          padding: "8px 16px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        Save delegation
                      </button>
                    </div>
                  </div>
                </div>

                {/* Currently delegating to me */}
                <div className="ht-elev-1" style={{ background: "var(--ht-surface)", borderRadius: 12, border: "1px solid var(--ht-border)" }}>
                  <div style={{ padding: "20px 24px 18px", borderBottom: "1px solid var(--ht-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ht-ink)" }}>Delegating to me</div>
                      <div style={{ fontSize: 12, color: "var(--ht-ink-3)", marginTop: 4 }}>
                        Approvers whose queue you currently cover. Items appear in your Approvals inbox.
                      </div>
                    </div>
                    <span
                      style={{
                        background: "var(--ht-tint-orange)",
                        color: "var(--ht-warning)",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      6 covered items
                    </span>
                  </div>

                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "var(--ht-surface-2)", color: "var(--ht-ink-3)" }}>
                        <th style={{ padding: "10px 24px", fontWeight: 600, textAlign: "left" }}>From</th>
                        <th style={{ padding: "10px 16px", fontWeight: 600, textAlign: "left" }}>Period</th>
                        <th style={{ padding: "10px 16px", fontWeight: 600, textAlign: "left" }}>Scope</th>
                        <th style={{ padding: "10px 16px", fontWeight: 600, textAlign: "right" }}>Pending</th>
                        <th style={{ padding: "10px 24px 10px 16px", fontWeight: 600, textAlign: "right" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {DELEGATIONS_TO_ME.map((d) => (
                        <tr key={d.id} style={{ borderTop: "1px solid var(--ht-border)" }}>
                          <td style={{ padding: "16px 24px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span
                                style={{
                                  width: 30,
                                  height: 30,
                                  borderRadius: 999,
                                  background: "var(--ht-tint-navy)",
                                  color: "var(--ht-navy)",
                                  display: "grid",
                                  placeItems: "center",
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                {d.delegator.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                              </span>
                              <div>
                                <div style={{ fontWeight: 600, color: "var(--ht-ink)" }}>{d.delegator}</div>
                                <div style={{ fontSize: 11, color: "var(--ht-ink-3)" }}>
                                  {d.delegatorRole} · {d.team}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "16px" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ht-ink-2)" }}>
                              <span>{d.startDate}</span>
                              <ArrowRight size={12} color="var(--ht-ink-3)" />
                              <span>{d.endDate}</span>
                            </div>
                          </td>
                          <td style={{ padding: "16px", color: "var(--ht-ink-2)" }}>{d.scope}</td>
                          <td className="ht-mono ht-tabular" style={{ padding: "16px", textAlign: "right" }}>
                            <div style={{ fontWeight: 600, color: "var(--ht-ink)" }}>{d.pendingCount} reports</div>
                            <div style={{ fontSize: 11, color: "var(--ht-ink-3)", marginTop: 2 }}>
                              ${d.pendingTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </td>
                          <td style={{ padding: "16px 24px 16px 16px", textAlign: "right" }}>
                            <button
                              style={{
                                background: "var(--ht-surface-2)",
                                border: "1px solid var(--ht-border)",
                                color: "var(--ht-navy)",
                                padding: "6px 12px",
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              Open queue
                              <ArrowRight size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* Upcoming delegations */}
                <div className="ht-elev-1" style={{ background: "var(--ht-surface)", borderRadius: 12, border: "1px solid var(--ht-border)" }}>
                  <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--ht-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Scheduled delegations</div>
                    <button
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--ht-navy)",
                        fontSize: 12,
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        cursor: "pointer",
                      }}
                    >
                      <Plus size={12} strokeWidth={3} />
                      Add
                    </button>
                  </div>
                  <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { range: "May 04 → May 12, 2026", to: "Aliyah Brooks", reason: "HIMSS Chicago briefing", state: "Scheduled" as const },
                      { range: "Jun 24 → Jul 01, 2026", to: "Aliyah Brooks", reason: "Family vacation",        state: "Scheduled" as const },
                    ].map((row) => (
                      <div
                        key={row.range}
                        style={{
                          padding: "12px 14px",
                          background: "var(--ht-surface-2)",
                          border: "1px solid var(--ht-border)",
                          borderRadius: 8,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ht-ink)" }}>{row.range}</span>
                          <StatusPill status="Submitted" size="xs" />
                        </div>
                        <div style={{ fontSize: 12, color: "var(--ht-ink-2)" }}>
                          To <strong>{row.to}</strong> · {row.reason}
                        </div>
                        <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 11, fontWeight: 600 }}>
                          <span style={{ color: "var(--ht-navy)" }}>Edit</span>
                          <span style={{ color: "var(--ht-danger)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <XIcon size={11} /> Cancel
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Policy reminder */}
                <div
                  style={{
                    background: "var(--ht-tint-tan)",
                    border: "1px solid #E7CDA0",
                    borderRadius: 12,
                    padding: 18,
                    display: "flex",
                    gap: 12,
                  }}
                >
                  <ShieldAlert size={20} color="#7A5512" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#5C3F0E", marginBottom: 4 }}>
                      Policy reminder
                    </div>
                    <div style={{ fontSize: 12, color: "#6F4F12", lineHeight: 1.5 }}>
                      Reports above <strong>$2,500</strong> always escalate to <strong>Rosa Delacruz (Finance)</strong>,
                      regardless of delegation. Manager backups cannot approve their own submitted expenses.
                    </div>
                  </div>
                </div>

                {/* Audit log */}
                <div className="ht-elev-1" style={{ background: "var(--ht-surface)", borderRadius: 12, border: "1px solid var(--ht-border)" }}>
                  <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--ht-border)", display: "flex", alignItems: "center", gap: 8 }}>
                    <History size={14} color="var(--ht-ink-3)" />
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Recent activity</div>
                  </div>
                  <div style={{ padding: "8px 0" }}>
                    {AUDIT.map((a, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "10px 20px",
                          borderBottom: i === AUDIT.length - 1 ? "none" : "1px solid var(--ht-border)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ht-ink)" }}>{a.who}</span>
                          <span className="ht-mono" style={{ fontSize: 10, color: "var(--ht-ink-3)" }}>{a.when}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--ht-ink-2)" }}>
                          <span style={{ fontWeight: 500 }}>{a.action}</span>
                          <span style={{ color: "var(--ht-ink-3)" }}> · {a.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DesktopShell>
  );
}
