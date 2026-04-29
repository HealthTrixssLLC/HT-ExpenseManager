import { MobileShell } from "./_shared/Shells";
import {
  Search,
  SlidersHorizontal,
  Plus,
  Camera,
  Image as ImageIcon,
  Receipt,
  Home,
  FileText,
  CreditCard,
  User,
  Check,
  AlertCircle,
  Paperclip,
  X,
} from "lucide-react";

type GalleryReceipt = {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  capturedVia: "camera" | "email" | "upload";
  status: "Attached" | "Unattached" | "Needs review";
  attachedTo?: string;
  thumbTone: "tan" | "navy" | "teal" | "orange" | "green" | "grey";
};

const RECEIPTS: GalleryReceipt[] = [
  { id: "rcpt-8821", merchant: "Lyft",                amount: 28.00,  date: "Apr 28",  capturedVia: "camera", status: "Unattached",  thumbTone: "navy"   },
  { id: "rcpt-8820", merchant: "Starbucks",           amount: 22.85,  date: "Apr 28",  capturedVia: "camera", status: "Needs review", thumbTone: "green"  },
  { id: "rcpt-8819", merchant: "United Airlines",     amount: 412.30, date: "Apr 27",  capturedVia: "email",  status: "Unattached",  thumbTone: "teal"   },
  { id: "rcpt-8818", merchant: "Hilton Sacramento",   amount: 312.40, date: "Apr 24",  capturedVia: "email",  status: "Attached",    attachedTo: "EXP-2604-117", thumbTone: "tan" },
  { id: "rcpt-8817", merchant: "Office Depot",        amount: 41.25,  date: "Apr 18",  capturedVia: "upload", status: "Attached",    attachedTo: "EXP-2604-118", thumbTone: "orange" },
  { id: "rcpt-8816", merchant: "Lyft",                amount: 28.00,  date: "Apr 18",  capturedVia: "camera", status: "Attached",    attachedTo: "EXP-2604-118", thumbTone: "navy" },
  { id: "rcpt-8815", merchant: "Uber",                amount: 24.40,  date: "Apr 17",  capturedVia: "camera", status: "Attached",    attachedTo: "EXP-2604-118", thumbTone: "navy" },
  { id: "rcpt-8814", merchant: "Wynn Business Center", amount: 41.25, date: "Apr 16",  capturedVia: "camera", status: "Attached",    attachedTo: "EXP-2604-118", thumbTone: "orange" },
  { id: "rcpt-8813", merchant: "Jaleo Las Vegas",     amount: 184.62, date: "Apr 15",  capturedVia: "camera", status: "Attached",    attachedTo: "EXP-2604-118", thumbTone: "tan" },
  { id: "rcpt-8812", merchant: "HIMSS Registration",  amount: 425.00, date: "Apr 15",  capturedVia: "email",  status: "Attached",    attachedTo: "EXP-2604-118", thumbTone: "teal" },
  { id: "rcpt-8811", merchant: "Caesars Palace",      amount: 1042.00, date: "Apr 14", capturedVia: "email",  status: "Attached",    attachedTo: "EXP-2604-118", thumbTone: "tan" },
  { id: "rcpt-8810", merchant: "Delta Air Lines",     amount: 612.40, date: "Apr 14",  capturedVia: "email",  status: "Attached",    attachedTo: "EXP-2604-118", thumbTone: "navy" },
];

const TONE_BG: Record<GalleryReceipt["thumbTone"], string> = {
  tan:    "linear-gradient(160deg, #FBF1DC 0%, #F3DBB1 100%)",
  navy:   "linear-gradient(160deg, #E6EAF1 0%, #C9D4E5 100%)",
  teal:   "linear-gradient(160deg, #DEEBF1 0%, #B6D6DF 100%)",
  orange: "linear-gradient(160deg, #FFF1D6 0%, #FFCA4B 100%)",
  green:  "linear-gradient(160deg, #E1ECE7 0%, #B5D0C5 100%)",
  grey:   "linear-gradient(160deg, #ECEDEA 0%, #C9C9C0 100%)",
};

const STATUS_STYLES: Record<GalleryReceipt["status"], { bg: string; fg: string; icon: typeof Check }> = {
  Attached:       { bg: "var(--ht-tint-success)", fg: "var(--ht-success)", icon: Check },
  Unattached:     { bg: "var(--ht-tint-navy)",    fg: "var(--ht-navy)",    icon: Paperclip },
  "Needs review": { bg: "var(--ht-tint-orange)",  fg: "var(--ht-warning)", icon: AlertCircle },
};

const TABS = ["All (124)", "Unattached (8)", "This week (12)", "Needs review (3)"] as const;

export function ReceiptsGallery() {
  const activeTab = "Unattached (8)";
  const selectedIds = new Set(["rcpt-8821", "rcpt-8819"]);
  const selectionCount = selectedIds.size;

  return (
    <MobileShell>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--ht-canvas)" }}>
        {/* Header */}
        <div style={{ padding: "20px 20px 12px", background: "var(--ht-surface)", borderBottom: "1px solid var(--ht-border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ht-ink)", margin: 0, letterSpacing: -0.3 }}>
              Receipts
            </h1>
            <button
              aria-label="Capture new receipt"
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                background: "var(--ht-navy)",
                color: "white",
                display: "grid",
                placeItems: "center",
                border: "none",
                boxShadow: "0 4px 10px rgba(46, 69, 107, 0.25)",
              }}
            >
              <Plus size={18} strokeWidth={2.5} />
            </button>
          </div>

          {/* Search */}
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: 11, color: "var(--ht-ink-3)" }} />
            <input
              type="text"
              placeholder="Search by merchant, amount, or date"
              style={{
                width: "100%",
                height: 38,
                paddingLeft: 36,
                paddingRight: 40,
                borderRadius: 10,
                border: "1px solid var(--ht-border)",
                background: "var(--ht-surface-2)",
                fontSize: 13,
                color: "var(--ht-ink)",
                fontFamily: "inherit",
              }}
            />
            <button
              aria-label="Filters"
              style={{
                position: "absolute",
                right: 6,
                top: 5,
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "transparent",
                border: "none",
                display: "grid",
                placeItems: "center",
                color: "var(--ht-ink-3)",
              }}
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              margin: "0 -20px",
              paddingLeft: 20,
              paddingRight: 20,
              paddingBottom: 4,
            }}
          >
            {TABS.map((tab) => {
              const active = tab === activeTab;
              return (
                <span
                  key={tab}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "6px 12px",
                    borderRadius: 999,
                    background: active ? "var(--ht-navy)" : "var(--ht-surface-2)",
                    color: active ? "white" : "var(--ht-ink-2)",
                    border: active ? "1px solid var(--ht-navy)" : "1px solid var(--ht-border)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {tab}
                </span>
              );
            })}
          </div>
        </div>

        {/* Section header */}
        <div style={{ padding: "16px 20px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ht-ink-3)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            April 2026 · 8 unattached
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ht-navy)" }}>Select</span>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 16px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            {RECEIPTS.map((r) => {
              const selected = selectedIds.has(r.id);
              const status = STATUS_STYLES[r.status];
              const StatusIcon = status.icon;
              return (
                <div
                  key={r.id}
                  className="ht-elev-1"
                  style={{
                    background: "var(--ht-surface)",
                    borderRadius: 12,
                    border: selected ? "2px solid var(--ht-navy)" : "1px solid var(--ht-border)",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {/* Thumb */}
                  <div
                    style={{
                      height: 130,
                      background: TONE_BG[r.thumbTone],
                      position: "relative",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {/* Receipt-paper mock */}
                    <div
                      style={{
                        width: "62%",
                        height: "82%",
                        background: "rgba(255,255,255,0.92)",
                        borderRadius: 4,
                        padding: 10,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        boxShadow: "0 4px 10px rgba(20,35,59,0.10)",
                      }}
                    >
                      <div style={{ height: 6, width: "70%", background: "var(--ht-ink)", borderRadius: 1 }} />
                      <div style={{ height: 3, width: "50%", background: "var(--ht-border-strong)", borderRadius: 1 }} />
                      <div style={{ flex: 1 }} />
                      <div style={{ height: 2, width: "100%", background: "var(--ht-border)" }} />
                      <div style={{ height: 2, width: "100%", background: "var(--ht-border)" }} />
                      <div style={{ height: 2, width: "85%", background: "var(--ht-border)" }} />
                      <div style={{ height: 2, width: "100%", background: "var(--ht-border)" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <div style={{ height: 4, width: "30%", background: "var(--ht-ink-2)", borderRadius: 1 }} />
                        <div style={{ height: 4, width: "30%", background: "var(--ht-ink-2)", borderRadius: 1 }} />
                      </div>
                    </div>

                    {/* Selection checkbox */}
                    <div
                      style={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        background: selected ? "var(--ht-navy)" : "rgba(255,255,255,0.85)",
                        border: selected ? "2px solid var(--ht-navy)" : "1.5px solid var(--ht-border-strong)",
                        display: "grid",
                        placeItems: "center",
                        color: "white",
                      }}
                    >
                      {selected && <Check size={12} strokeWidth={3} />}
                    </div>

                    {/* Capture method icon */}
                    <div
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.85)",
                        display: "grid",
                        placeItems: "center",
                        color: "var(--ht-ink-2)",
                      }}
                    >
                      {r.capturedVia === "camera" && <Camera size={12} />}
                      {r.capturedVia === "email" && <Receipt size={12} />}
                      {r.capturedVia === "upload" && <ImageIcon size={12} />}
                    </div>
                  </div>

                  {/* Meta */}
                  <div style={{ padding: "10px 12px 12px" }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--ht-ink)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.merchant}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--ht-ink-3)", fontWeight: 500 }}>{r.date}</span>
                      <span className="ht-mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--ht-ink)" }}>
                        ${r.amount.toFixed(2)}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        background: status.bg,
                        color: status.fg,
                        padding: "2px 7px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.2,
                      }}
                    >
                      <StatusIcon size={10} strokeWidth={2.6} />
                      {r.status === "Attached" ? r.attachedTo : r.status}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sticky selection action bar */}
        <div
          style={{
            background: "var(--ht-navy)",
            color: "white",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 -6px 20px rgba(20,35,59,0.18)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              aria-label="Clear selection"
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: "rgba(255,255,255,0.15)",
                border: "none",
                color: "white",
                display: "grid",
                placeItems: "center",
              }}
            >
              <X size={14} />
            </button>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{selectionCount} selected</span>
          </div>
          <button
            style={{
              background: "var(--ht-orange)",
              color: "var(--ht-ink)",
              border: "none",
              padding: "9px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Paperclip size={14} strokeWidth={2.5} />
            Attach to report
          </button>
        </div>

        {/* Tab Bar */}
        <div style={{ display: "flex", borderTop: "1px solid var(--ht-border)", background: "var(--ht-surface)", paddingBottom: 16 }}>
          {[
            { icon: Home, label: "Home" },
            { icon: FileText, label: "Reports" },
            { icon: CreditCard, label: "Receipts", active: true },
            { icon: User, label: "Profile" },
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
