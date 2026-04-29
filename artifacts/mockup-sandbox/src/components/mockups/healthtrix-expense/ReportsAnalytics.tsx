import {
  LayoutDashboard,
  Inbox,
  Send,
  CalendarDays,
  FileCheck,
  FileBarChart,
  Settings,
  Download,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CircleDollarSign,
  AlertTriangle,
  Users,
} from "lucide-react";
import { DesktopShell } from "./_shared/Shells";
import { DesktopTopbar } from "./_shared/BrandHeader";
import { Sidebar } from "./_shared/Sidebar";

type DeptRow = {
  dept: string;
  spendK: number;     // in thousands of $
  reports: number;
  yoy: number;        // percentage change YoY
};

const DEPT_SPEND: DeptRow[] = [
  { dept: "Clinical Operations", spendK: 184.2, reports: 132, yoy: 8.4 },
  { dept: "Sales",               spendK: 156.7, reports: 188, yoy: 14.2 },
  { dept: "Executive",           spendK:  92.4, reports:  41, yoy: -3.1 },
  { dept: "IT & Security",       spendK:  74.1, reports:  58, yoy: 22.8 },
  { dept: "Revenue Cycle",       spendK:  61.9, reports:  77, yoy: 5.6 },
  { dept: "Compliance",          spendK:  28.3, reports:  34, yoy: -1.9 },
];

type CategoryRow = {
  category: string;
  amount: number;
  pct: number;
  color: string;
};

const CATEGORIES: CategoryRow[] = [
  { category: "Travel:Airfare",            amount: 142800, pct: 24, color: "var(--ht-navy)" },
  { category: "Travel:Lodging",            amount: 118400, pct: 20, color: "var(--ht-teal)" },
  { category: "Conferences & Trade Shows",  amount:  92100, pct: 15, color: "var(--ht-orange)" },
  { category: "Meals & Entertainment",     amount:  67500, pct: 11, color: "var(--ht-light-teal)" },
  { category: "Travel:Ground Transport",   amount:  41200, pct:  7, color: "var(--ht-light-green)" },
  { category: "Continuing Education",      amount:  38700, pct:  6, color: "var(--ht-light-orange)" },
  { category: "Software Subscriptions",    amount:  29400, pct:  5, color: "var(--ht-tan)" },
  { category: "Other",                     amount:  67500, pct: 12, color: "var(--ht-light-grey)" },
];

const TOP_SPENDERS = [
  { name: "Rosa Delacruz",   dept: "Executive",           ytd: 18420, reports: 7, avg: 2631 },
  { name: "Jordan Whitfield", dept: "Sales",              ytd: 14680, reports: 12, avg: 1223 },
  { name: "Priya Raghavan",  dept: "Clinical Operations", ytd: 11240, reports: 6, avg: 1873 },
  { name: "Diane Okafor",    dept: "IT & Security",       ytd:  9460, reports: 4, avg: 2365 },
  { name: "Anika Bhatt",     dept: "Clinical Operations", ytd:  8120, reports: 7, avg: 1160 },
];

// Monthly trend data (Nov 2025 → Apr 2026)
const TREND_MONTHS = ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"] as const;
const TREND_VALUES = [82, 71, 96, 104, 119, 128]; // in $K

function fmtUsd(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function FilterChip({
  label,
  value,
  primary = false,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <button
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: primary ? "var(--ht-navy)" : "var(--ht-surface)",
        color: primary ? "white" : "var(--ht-ink-2)",
        border: primary ? "1px solid var(--ht-navy)" : "1px solid var(--ht-border)",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 11, color: primary ? "rgba(255,255,255,0.7)" : "var(--ht-ink-3)", fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ fontWeight: 600 }}>{value}</span>
      <ChevronDown size={13} />
    </button>
  );
}

function Kpi({
  icon,
  label,
  value,
  delta,
  deltaTone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: string;
  deltaTone: "up" | "down" | "neutral";
  hint: string;
}) {
  const deltaColor =
    deltaTone === "up" ? "var(--ht-warning)" :
    deltaTone === "down" ? "var(--ht-success)" :
    "var(--ht-ink-3)";
  const Arrow = deltaTone === "down" ? ArrowDownRight : ArrowUpRight;
  return (
    <div className="ht-elev-1" style={{ flex: 1, background: "var(--ht-surface)", padding: 20, borderRadius: 12, border: "1px solid var(--ht-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ht-ink-2)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
        {icon}
        {label}
      </div>
      <div className="ht-mono ht-tabular" style={{ fontSize: 26, fontWeight: 700, color: "var(--ht-navy)", letterSpacing: -0.5 }}>
        {value}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color: deltaColor, fontSize: 12, fontWeight: 700 }}>
          <Arrow size={12} strokeWidth={2.6} />
          {delta}
        </span>
        <span style={{ fontSize: 12, color: "var(--ht-ink-3)" }}>{hint}</span>
      </div>
    </div>
  );
}

export function ReportsAnalytics() {
  const sidebarItems = [
    { label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { label: "Approvals", icon: <Inbox size={18} /> },
    { label: "Posting", icon: <Send size={18} /> },
    { label: "Payroll Queue", icon: <CalendarDays size={18} /> },
    { label: "Reconciliation", icon: <FileCheck size={18} /> },
    { label: "Reports", icon: <FileBarChart size={18} />, active: true },
    { label: "Settings", icon: <Settings size={18} /> },
  ];

  // Trend chart geometry
  const chartW = 540;
  const chartH = 180;
  const padL = 36, padR = 12, padT = 14, padB = 26;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const maxV = 140;
  const xFor = (i: number) => padL + (innerW * i) / (TREND_VALUES.length - 1);
  const yFor = (v: number) => padT + innerH - (innerH * v) / maxV;
  const linePath = TREND_VALUES.map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(v)}`).join(" ");
  const areaPath =
    `${linePath} L ${xFor(TREND_VALUES.length - 1)} ${padT + innerH} L ${xFor(0)} ${padT + innerH} Z`;

  const maxDept = Math.max(...DEPT_SPEND.map((d) => d.spendK));

  return (
    <DesktopShell width={1280} height={900}>
      <DesktopTopbar user="Rosa Delacruz" role="Finance Approver" />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar items={sidebarItems} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--ht-canvas)" }}>
          {/* Page header */}
          <div style={{ padding: "28px 40px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--ht-navy)", margin: "0 0 6px 0", letterSpacing: -0.3 }}>
                  Reports &amp; analytics
                </h1>
                <div style={{ fontSize: 14, color: "var(--ht-ink-3)" }}>
                  Healthtrix expense spend, cycle time, and policy compliance · refreshed 14 minutes ago
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "var(--ht-surface)",
                    border: "1px solid var(--ht-border)",
                    color: "var(--ht-ink-2)",
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <Download size={14} />
                  Export CSV
                </button>
                <button
                  style={{
                    background: "var(--ht-navy)",
                    color: "white",
                    border: "none",
                    padding: "8px 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Schedule report
                </button>
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 24 }}>
              <FilterChip label="Period" value="Nov 2025 — Apr 2026" primary />
              <FilterChip label="Department" value="All departments" />
              <FilterChip label="Currency" value="USD" />
              <FilterChip label="Compare" value="vs prior 6 months" />
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ht-ink-3)" }}>
                Showing 530 reports · $597,640 total spend
              </span>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 40px 40px" }}>
            {/* KPIs */}
            <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
              <Kpi
                icon={<CircleDollarSign size={14} color="var(--ht-navy)" />}
                label="Total spend"
                value="$597,640"
                delta="+11.4%"
                deltaTone="up"
                hint="vs prior 6 months"
              />
              <Kpi
                icon={<Clock size={14} color="var(--ht-teal)" />}
                label="Avg cycle time"
                value="6.2 days"
                delta="-1.4 d"
                deltaTone="down"
                hint="submit → reimbursed"
              />
              <Kpi
                icon={<AlertTriangle size={14} color="var(--ht-orange)" />}
                label="Policy violations"
                value="3.8%"
                delta="-0.7 pp"
                deltaTone="down"
                hint="of submitted line items"
              />
              <Kpi
                icon={<Users size={14} color="var(--ht-success)" />}
                label="Active employees"
                value="187"
                delta="+12"
                deltaTone="up"
                hint="submitted ≥ 1 report"
              />
            </div>

            {/* Row: trend + categories */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24, marginBottom: 24 }}>
              {/* Spend trend */}
              <div className="ht-elev-1" style={{ background: "var(--ht-surface)", padding: 20, borderRadius: 12, border: "1px solid var(--ht-border)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Spend trend</div>
                    <div style={{ fontSize: 12, color: "var(--ht-ink-3)", marginTop: 2 }}>Last 6 months · all departments</div>
                  </div>
                  <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--ht-ink-2)", fontWeight: 500 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--ht-navy)" }} />
                      Reimbursed
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--ht-tan)" }} />
                      Posted to QuickBooks
                    </span>
                  </div>
                </div>

                <svg width={chartW} height={chartH} style={{ display: "block", overflow: "visible" }}>
                  <defs>
                    <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--ht-navy)" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="var(--ht-navy)" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {/* Y gridlines */}
                  {[0, 35, 70, 105, 140].map((tick) => (
                    <g key={tick}>
                      <line
                        x1={padL}
                        x2={chartW - padR}
                        y1={yFor(tick)}
                        y2={yFor(tick)}
                        stroke="var(--ht-border)"
                        strokeDasharray={tick === 0 ? "0" : "3 3"}
                      />
                      <text
                        x={padL - 8}
                        y={yFor(tick) + 4}
                        textAnchor="end"
                        fontSize="10"
                        fill="var(--ht-ink-3)"
                        fontFamily='"IBM Plex Mono", monospace'
                      >
                        ${tick}K
                      </text>
                    </g>
                  ))}
                  {/* Area */}
                  <path d={areaPath} fill="url(#trendArea)" />
                  {/* Bars stacked beneath line — posted slice */}
                  {TREND_VALUES.map((v, i) => {
                    const barW = 22;
                    const x = xFor(i) - barW / 2;
                    const totalH = padT + innerH - yFor(v);
                    const postedH = totalH * 0.30;
                    const reimbH = totalH - postedH;
                    return (
                      <g key={i}>
                        <rect
                          x={x}
                          y={padT + innerH - postedH}
                          width={barW}
                          height={postedH}
                          fill="var(--ht-tan)"
                          opacity="0.55"
                        />
                        <rect
                          x={x}
                          y={padT + innerH - totalH}
                          width={barW}
                          height={reimbH}
                          fill="var(--ht-navy)"
                          opacity="0.18"
                        />
                      </g>
                    );
                  })}
                  {/* Line */}
                  <path d={linePath} fill="none" stroke="var(--ht-navy)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
                  {/* Points */}
                  {TREND_VALUES.map((v, i) => (
                    <g key={i}>
                      <circle cx={xFor(i)} cy={yFor(v)} r="4" fill="white" stroke="var(--ht-navy)" strokeWidth="2" />
                      <text
                        x={xFor(i)}
                        y={chartH - 6}
                        textAnchor="middle"
                        fontSize="11"
                        fill="var(--ht-ink-3)"
                      >
                        {TREND_MONTHS[i]}
                      </text>
                    </g>
                  ))}
                  {/* Highlight latest */}
                  <text
                    x={xFor(TREND_VALUES.length - 1)}
                    y={yFor(TREND_VALUES[TREND_VALUES.length - 1]) - 12}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill="var(--ht-navy)"
                    fontFamily='"IBM Plex Mono", monospace'
                  >
                    $128K
                  </text>
                </svg>
              </div>

              {/* Top categories */}
              <div className="ht-elev-1" style={{ background: "var(--ht-surface)", padding: 20, borderRadius: 12, border: "1px solid var(--ht-border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Top QuickBooks categories</div>
                    <div style={{ fontSize: 12, color: "var(--ht-ink-3)", marginTop: 2 }}>By spend · last 6 months</div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {CATEGORIES.map((c) => (
                    <div key={c.category}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--ht-ink-2)", fontWeight: 500 }}>{c.category}</span>
                        <span className="ht-mono ht-tabular" style={{ fontSize: 12, fontWeight: 600, color: "var(--ht-ink)" }}>
                          ${fmtUsd(c.amount)}
                        </span>
                      </div>
                      <div style={{ height: 6, background: "var(--ht-canvas)", borderRadius: 999, overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${(c.pct / 24) * 100}%`,
                            height: "100%",
                            background: c.color,
                            borderRadius: 999,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row: dept spend + cycle time */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24, marginBottom: 24 }}>
              {/* Spend by department */}
              <div className="ht-elev-1" style={{ background: "var(--ht-surface)", padding: 20, borderRadius: 12, border: "1px solid var(--ht-border)" }}>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Spend by department</div>
                    <div style={{ fontSize: 12, color: "var(--ht-ink-3)", marginTop: 2 }}>Click a bar to drill into reports</div>
                  </div>
                </div>

                <table style={{ width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "var(--ht-ink-3)", textAlign: "left" }}>
                      <th style={{ padding: "0 0 8px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Department</th>
                      <th colSpan={2} style={{ padding: "0 0 8px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Spend</th>
                      <th style={{ padding: "0 0 8px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" }}>Reports</th>
                      <th style={{ padding: "0 0 8px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" }}>YoY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEPT_SPEND.map((d) => {
                      const widthPct = (d.spendK / maxDept) * 100;
                      const yoyUp = d.yoy >= 0;
                      return (
                        <tr key={d.dept}>
                          <td style={{ padding: "10px 0", color: "var(--ht-ink)", fontWeight: 500, width: 180 }}>{d.dept}</td>
                          <td style={{ padding: "10px 0", width: "55%" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div
                                style={{
                                  flex: 1,
                                  height: 16,
                                  borderRadius: 4,
                                  background: "var(--ht-canvas)",
                                  position: "relative",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    width: `${widthPct}%`,
                                    height: "100%",
                                    background: "linear-gradient(90deg, var(--ht-navy), var(--ht-teal))",
                                    borderRadius: 4,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="ht-mono ht-tabular" style={{ padding: "10px 12px", color: "var(--ht-ink)", fontWeight: 600, width: 90, textAlign: "right" }}>
                            ${d.spendK.toFixed(1)}K
                          </td>
                          <td className="ht-mono ht-tabular" style={{ padding: "10px 0", color: "var(--ht-ink-3)", textAlign: "right" }}>
                            {d.reports}
                          </td>
                          <td style={{ padding: "10px 0", textAlign: "right" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 2,
                                fontSize: 12,
                                fontWeight: 700,
                                color: yoyUp ? "var(--ht-warning)" : "var(--ht-success)",
                              }}
                            >
                              {yoyUp ? <ArrowUpRight size={12} strokeWidth={2.6} /> : <ArrowDownRight size={12} strokeWidth={2.6} />}
                              {yoyUp ? "+" : ""}
                              {d.yoy.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Cycle time funnel */}
              <div className="ht-elev-1" style={{ background: "var(--ht-surface)", padding: 20, borderRadius: 12, border: "1px solid var(--ht-border)" }}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Cycle time</div>
                  <div style={{ fontSize: 12, color: "var(--ht-ink-3)", marginTop: 2 }}>Avg days per stage · last 90 days</div>
                </div>

                {/* Funnel */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    { label: "Submit → Manager Review", days: 0.4, pct: 7, color: "var(--ht-teal)" },
                    { label: "Manager Review → Approved", days: 1.8, pct: 29, color: "var(--ht-navy)" },
                    { label: "Approved → Finance Review", days: 0.6, pct: 10, color: "var(--ht-light-teal)" },
                    { label: "Finance Review → Posted", days: 1.2, pct: 19, color: "var(--ht-orange)" },
                    { label: "Posted → Reimbursed", days: 2.2, pct: 35, color: "var(--ht-tan)" },
                  ].map((s) => (
                    <div key={s.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, fontSize: 12 }}>
                        <span style={{ color: "var(--ht-ink-2)", fontWeight: 500 }}>{s.label}</span>
                        <span className="ht-mono ht-tabular" style={{ color: "var(--ht-ink)", fontWeight: 600 }}>
                          {s.days.toFixed(1)} d
                        </span>
                      </div>
                      <div style={{ height: 10, background: "var(--ht-canvas)", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: `${s.pct * 2.6}%`, height: "100%", background: s.color, borderRadius: 999 }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: 18,
                    padding: "12px 14px",
                    background: "var(--ht-tint-success)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#356253",
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <ArrowDownRight size={14} color="var(--ht-success)" strokeWidth={2.6} />
                  Cycle time is <strong>1.4 days faster</strong> than the prior period — driven by mobile receipt capture adoption.
                </div>
              </div>
            </div>

            {/* Top spenders table */}
            <div className="ht-elev-1" style={{ background: "var(--ht-surface)", borderRadius: 12, border: "1px solid var(--ht-border)", overflow: "hidden" }}>
              <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--ht-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-ink)" }}>Top spenders</div>
                  <div style={{ fontSize: 12, color: "var(--ht-ink-3)", marginTop: 2 }}>YTD reimbursed total</div>
                </div>
                <span style={{ fontSize: 12, color: "var(--ht-navy)", fontWeight: 600, cursor: "pointer" }}>View all 187 employees</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--ht-surface-2)", color: "var(--ht-ink-3)" }}>
                    <th style={{ padding: "10px 24px", fontWeight: 600, textAlign: "left" }}>Employee</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600, textAlign: "left" }}>Department</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600, textAlign: "right" }}>YTD reimbursed</th>
                    <th style={{ padding: "10px 16px", fontWeight: 600, textAlign: "right" }}>Reports</th>
                    <th style={{ padding: "10px 24px 10px 16px", fontWeight: 600, textAlign: "right" }}>Avg / report</th>
                  </tr>
                </thead>
                <tbody>
                  {TOP_SPENDERS.map((s) => (
                    <tr key={s.name} style={{ borderTop: "1px solid var(--ht-border)" }}>
                      <td style={{ padding: "14px 24px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 999,
                              background: "var(--ht-tint-navy)",
                              color: "var(--ht-navy)",
                              display: "grid",
                              placeItems: "center",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {s.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                          </span>
                          <span style={{ fontWeight: 600, color: "var(--ht-ink)" }}>{s.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--ht-ink-2)" }}>{s.dept}</td>
                      <td className="ht-mono ht-tabular" style={{ padding: "14px 16px", textAlign: "right", color: "var(--ht-navy)", fontWeight: 600 }}>
                        ${fmtUsd(s.ytd)}
                      </td>
                      <td className="ht-mono ht-tabular" style={{ padding: "14px 16px", textAlign: "right", color: "var(--ht-ink-2)" }}>
                        {s.reports}
                      </td>
                      <td className="ht-mono ht-tabular" style={{ padding: "14px 24px 14px 16px", textAlign: "right", color: "var(--ht-ink-2)" }}>
                        ${fmtUsd(s.avg)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </DesktopShell>
  );
}
