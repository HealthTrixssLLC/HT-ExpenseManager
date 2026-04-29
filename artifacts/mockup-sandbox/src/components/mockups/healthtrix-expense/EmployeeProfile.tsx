import { MobileShell } from "./_shared/Shells";
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Building2,
  Bell,
  Mail,
  Smartphone,
  Shield,
  KeyRound,
  HelpCircle,
  LogOut,
  Home,
  FileText,
  User,
  Camera,
  Car,
} from "lucide-react";

type ToggleProps = { on: boolean };

function Toggle({ on }: ToggleProps) {
  return (
    <span
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        background: on ? "var(--ht-navy)" : "var(--ht-border-strong)",
        position: "relative",
        flexShrink: 0,
        transition: "background .15s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
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

function Row({
  label,
  value,
  icon,
  meta,
  trailing,
  isLast = false,
}: {
  label: string;
  value?: string;
  icon?: React.ReactNode;
  meta?: string;
  trailing?: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 16px",
        borderBottom: isLast ? "none" : "1px solid var(--ht-border)",
      }}
    >
      {icon && (
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "var(--ht-tint-navy)",
            color: "var(--ht-navy)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ht-ink)" }}>{label}</div>
        {meta && (
          <div style={{ fontSize: 12, color: "var(--ht-ink-3)", marginTop: 2 }}>{meta}</div>
        )}
      </div>
      {value && (
        <span
          style={{
            fontSize: 13,
            color: "var(--ht-ink-2)",
            fontWeight: 500,
            maxWidth: 170,
            textAlign: "right",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {value}
        </span>
      )}
      {trailing ?? (value ? <ChevronRight size={16} color="var(--ht-ink-3)" /> : null)}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "var(--ht-ink-3)",
        textTransform: "uppercase",
        letterSpacing: 0.8,
        padding: "20px 20px 10px",
      }}
    >
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="ht-elev-1"
      style={{
        margin: "0 16px",
        background: "var(--ht-surface)",
        borderRadius: 12,
        border: "1px solid var(--ht-border)",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

export function EmployeeProfile() {
  return (
    <MobileShell>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--ht-canvas)" }}>
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 12px 6px",
            background: "var(--ht-surface)",
          }}
        >
          <button
            aria-label="Back"
            style={{
              background: "transparent",
              border: "none",
              padding: 6,
              display: "grid",
              placeItems: "center",
              color: "var(--ht-navy)",
            }}
          >
            <ChevronLeft size={22} />
          </button>
          <div style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: 600, color: "var(--ht-ink)" }}>
            Profile
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ht-navy)", paddingRight: 10 }}>Edit</span>
        </div>

        {/* Identity card */}
        <div style={{ padding: "16px 20px 24px", background: "var(--ht-surface)", borderBottom: "1px solid var(--ht-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 999,
                  background: "var(--ht-navy)",
                  color: "white",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                }}
              >
                PR
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  background: "var(--ht-orange)",
                  border: "2px solid var(--ht-surface)",
                  color: "var(--ht-ink)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Camera size={12} strokeWidth={2.5} />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ht-ink)", letterSpacing: -0.2 }}>
                Priya Raghavan
              </div>
              <div style={{ fontSize: 13, color: "var(--ht-ink-2)", marginTop: 2 }}>
                RN, Clinical Workflows Lead
              </div>
              <div style={{ fontSize: 12, color: "var(--ht-ink-3)", marginTop: 4 }}>
                Employee · ID HX-04127
              </div>
            </div>
          </div>
        </div>

        {/* Scroll content */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>
          <SectionLabel>Personal info</SectionLabel>
          <Card>
            <Row label="Email" value="priya.raghavan@healthtrix.com" />
            <Row label="Mobile" value="+1 (415) 555-0142" />
            <Row label="Department" value="Clinical Operations" />
            <Row label="Reports to" value="Marcus Chen" isLast />
          </Card>

          <SectionLabel>Defaults</SectionLabel>
          <Card>
            <Row
              label="Default department"
              value="Clinical Operations"
              icon={<Building2 size={16} />}
              meta="Used as the GL department on new reports"
            />
            <Row
              label="Default payment method"
              value="Personal Card · Visa ••4318"
              icon={<CreditCard size={16} />}
            />
            <Row
              label="Mileage rate"
              value="$0.67/mi (IRS 2026)"
              icon={<Car size={16} />}
              meta="Auto-calculated for mileage line items"
              isLast
            />
          </Card>

          <SectionLabel>Notifications</SectionLabel>
          <Card>
            <Row
              label="Status changes"
              icon={<Bell size={16} />}
              meta="Approved, changes requested, paid"
              trailing={<Toggle on />}
            />
            <Row
              label="Comments on my reports"
              icon={<Mail size={16} />}
              trailing={<Toggle on />}
            />
            <Row
              label="Missing receipt reminders"
              icon={<Smartphone size={16} />}
              meta="Push every Friday at 4:30 pm"
              trailing={<Toggle on />}
            />
            <Row
              label="Weekly digest email"
              icon={<Mail size={16} />}
              meta="Mondays · summary of last week"
              trailing={<Toggle on={false} />}
              isLast
            />
          </Card>

          <SectionLabel>Security</SectionLabel>
          <Card>
            <Row label="Change password" icon={<KeyRound size={16} />} value=" " />
            <Row
              label="Two-factor authentication"
              icon={<Shield size={16} />}
              meta="Authenticator app · last verified Apr 14"
              trailing={<Toggle on />}
              isLast
            />
          </Card>

          <SectionLabel>Help</SectionLabel>
          <Card>
            <Row label="Expense policy & limits" icon={<HelpCircle size={16} />} value=" " />
            <Row label="Contact support" icon={<HelpCircle size={16} />} value=" " isLast />
          </Card>

          <div style={{ padding: "24px 20px 12px" }}>
            <button
              style={{
                width: "100%",
                background: "var(--ht-surface)",
                color: "var(--ht-danger)",
                border: "1px solid var(--ht-border)",
                borderRadius: 12,
                padding: "14px",
                fontSize: 14,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <LogOut size={16} />
              Sign out
            </button>
            <div
              style={{
                textAlign: "center",
                marginTop: 14,
                fontSize: 11,
                color: "var(--ht-ink-3)",
                letterSpacing: 0.3,
              }}
            >
              Healthtrix Expense · v3.4.1 (build 26104)
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderTop: "1px solid var(--ht-border)", background: "var(--ht-surface)", paddingBottom: 16 }}>
          {[
            { icon: Home, label: "Home" },
            { icon: FileText, label: "Reports" },
            { icon: CreditCard, label: "Receipts" },
            { icon: User, label: "Profile", active: true },
          ].map((tab) => (
            <div
              key={tab.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "12px 0",
                gap: 4,
                color: tab.active ? "var(--ht-navy)" : "var(--ht-ink-3)",
              }}
            >
              <tab.icon size={24} strokeWidth={tab.active ? 2.5 : 2} />
              <span style={{ fontSize: 11, fontWeight: tab.active ? 700 : 500 }}>{tab.label}</span>
            </div>
          ))}
        </div>
      </div>
    </MobileShell>
  );
}
