import { Check, X as XIcon, RotateCcw, Ban } from "lucide-react";
import { WORKFLOW_ORDER, type WorkflowStatus } from "./types";

/**
 * Off-ramps from the linear workflow.
 * - "Changes Requested" branches from Manager Review
 * - "Rejected" branches from Manager Review or Finance Review
 * - "Voided" can branch from any in-flight step (admin action)
 *
 * The tracker always renders these as visible side branches so the diagram
 * communicates the full workflow model, with the active branch highlighted
 * when `current` matches the off-ramp state.
 */
type OffRamp = {
  status: Extract<WorkflowStatus, "Changes Requested" | "Rejected" | "Voided">;
  fromStep: WorkflowStatus;
  tone: "warning" | "danger" | "muted";
  Icon: typeof Check;
};

const OFFRAMPS: OffRamp[] = [
  { status: "Changes Requested", fromStep: "Manager Review", tone: "warning", Icon: RotateCcw },
  { status: "Rejected",          fromStep: "Manager Review", tone: "danger",  Icon: XIcon },
  // Voided can be triggered by an admin from any in-flight step; we anchor it on Submitted
  // so it always shows in the diagram. When current === "Voided" the side branch highlights.
  { status: "Voided",            fromStep: "Submitted",      tone: "muted",   Icon: Ban },
];

const TONE_COLOR: Record<"warning" | "danger" | "muted", { fg: string; bg: string; border: string }> = {
  warning: { fg: "var(--ht-warning)", bg: "var(--ht-tint-orange)", border: "var(--ht-orange)" },
  danger:  { fg: "var(--ht-danger)",  bg: "var(--ht-tint-danger)", border: "var(--ht-danger)" },
  muted:   { fg: "var(--ht-ink-3)",   bg: "var(--ht-tint-grey)",   border: "var(--ht-light-grey)" },
};

export function StatusTracker({
  current,
  variant = "vertical",
}: {
  current: WorkflowStatus;
  variant?: "vertical" | "horizontal";
}) {
  // If current is an off-ramp, the linear "active" position is the step it branched from
  const offRamp = OFFRAMPS.find((o) => o.status === current);
  const linearActive: WorkflowStatus = offRamp ? offRamp.fromStep : current;
  const idx = WORKFLOW_ORDER.indexOf(linearActive);
  const isOnLinear = !offRamp;
  // When on an off-ramp, the step it branched from is "paused" (not done, not active)
  const pauseAt = offRamp ? offRamp.fromStep : null;

  if (variant === "horizontal") {
    return (
      <div style={{ width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0, width: "100%" }}>
          {WORKFLOW_ORDER.map((step, i) => {
            const done = i < idx;
            const active = i === idx && isOnLinear;
            const paused = step === pauseAt;
            return (
              <div key={step} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: done ? "var(--ht-teal)" : active ? "var(--ht-orange)" : paused ? "var(--ht-surface)" : "var(--ht-surface)",
                    border: `2px solid ${done ? "var(--ht-teal)" : active ? "var(--ht-orange)" : paused ? "var(--ht-orange)" : "var(--ht-border-strong)"}`,
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    color: "white",
                  }}
                  aria-label={step}
                >
                  {done && <Check size={12} strokeWidth={3} />}
                  {active && <span style={{ width: 8, height: 8, background: "white", borderRadius: 999 }} />}
                  {paused && <span style={{ width: 6, height: 6, background: "var(--ht-orange)", borderRadius: 999 }} />}
                </div>
                {i < WORKFLOW_ORDER.length - 1 && (
                  <div
                    style={{
                      flex: 1,
                      height: 2,
                      background: i < idx ? "var(--ht-teal)" : "var(--ht-border)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {/* Off-ramp tags rendered below the horizontal track */}
        {offRamp && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ color: "var(--ht-ink-3)" }}>Off-ramp from {offRamp.fromStep}:</span>
            <OffRampPill ramp={offRamp} active />
          </div>
        )}
      </div>
    );
  }

  return (
    <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {WORKFLOW_ORDER.map((step, i) => {
        const done = i < idx;
        const active = i === idx && isOnLinear;
        const paused = step === pauseAt;
        const upcoming = i > idx;
        const isLast = i === WORKFLOW_ORDER.length - 1;
        const branches = OFFRAMPS.filter((o) => o.fromStep === step);
        return (
          <li key={step} style={{ display: "flex", gap: 14, paddingBottom: isLast ? 0 : 14, position: "relative" }}>
            {!isLast && (
              <span
                style={{
                  position: "absolute",
                  left: 11,
                  top: 24,
                  bottom: -2,
                  width: 2,
                  background: done ? "var(--ht-teal)" : "var(--ht-border)",
                }}
              />
            )}
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 999,
                background: done ? "var(--ht-teal)" : active ? "var(--ht-orange)" : "var(--ht-surface)",
                border: `2px solid ${done ? "var(--ht-teal)" : active ? "var(--ht-orange)" : paused ? "var(--ht-orange)" : "var(--ht-border-strong)"}`,
                display: "grid",
                placeItems: "center",
                color: "white",
                flexShrink: 0,
                zIndex: 1,
                marginTop: 2,
              }}
              aria-label={step}
            >
              {done ? (
                <Check size={13} strokeWidth={3} />
              ) : active ? (
                <span style={{ width: 8, height: 8, background: "white", borderRadius: 999 }} />
              ) : paused ? (
                <span style={{ width: 8, height: 8, background: "var(--ht-orange)", borderRadius: 999 }} />
              ) : (
                <span style={{ width: 6, height: 6, background: "var(--ht-border-strong)", borderRadius: 999 }} />
              )}
            </div>
            <div style={{ flex: 1, paddingTop: 3 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: active || paused ? 600 : done ? 500 : 500,
                  color: upcoming ? "var(--ht-ink-3)" : "var(--ht-ink)",
                }}
              >
                {step}
              </div>
              {paused && (
                <div style={{ fontSize: 11, color: "var(--ht-warning)", fontWeight: 500, marginTop: 2 }}>
                  Paused — awaiting employee revision
                </div>
              )}
              {/* Branch off-ramp side nodes */}
              {branches.length > 0 && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                  {branches.map((b) => (
                    <OffRampBranch
                      key={b.status}
                      ramp={b}
                      active={offRamp?.status === b.status}
                    />
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function OffRampBranch({ ramp, active }: { ramp: OffRamp; active: boolean }) {
  const tone = TONE_COLOR[ramp.tone];
  const Icon = ramp.Icon;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden style={{ flexShrink: 0 }}>
        <path
          d="M1 0 L1 7 Q1 13 7 13 L20 13"
          stroke={active ? tone.border : "var(--ht-border)"}
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          fontWeight: 600,
          padding: "3px 9px",
          borderRadius: 999,
          background: active ? tone.bg : "transparent",
          color: active ? tone.fg : "var(--ht-ink-3)",
          border: `1px ${active ? "solid" : "dashed"} ${active ? tone.border : "var(--ht-border-strong)"}`,
        }}
      >
        <Icon size={11} strokeWidth={2.5} />
        {ramp.status}
      </span>
    </div>
  );
}

function OffRampPill({ ramp, active }: { ramp: OffRamp; active: boolean }) {
  const tone = TONE_COLOR[ramp.tone];
  const Icon = ramp.Icon;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 999,
        background: active ? tone.bg : "transparent",
        color: active ? tone.fg : "var(--ht-ink-3)",
        border: `1px ${active ? "solid" : "dashed"} ${active ? tone.border : "var(--ht-border-strong)"}`,
      }}
    >
      <Icon size={12} strokeWidth={2.5} />
      {ramp.status}
    </span>
  );
}
