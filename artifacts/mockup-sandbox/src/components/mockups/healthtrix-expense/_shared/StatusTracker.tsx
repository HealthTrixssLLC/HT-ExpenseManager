import { Check } from "lucide-react";
import { WORKFLOW_ORDER, type WorkflowStatus } from "./types";

export function StatusTracker({
  current,
  variant = "vertical",
  changesRequested = false,
}: {
  current: WorkflowStatus;
  variant?: "vertical" | "horizontal";
  changesRequested?: boolean;
}) {
  const idx = WORKFLOW_ORDER.indexOf(current);

  if (variant === "horizontal") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 0, width: "100%" }}>
        {WORKFLOW_ORDER.map((step, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <div key={step} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  background: done ? "var(--ht-teal)" : active ? "var(--ht-orange)" : "var(--ht-surface)",
                  border: `2px solid ${done ? "var(--ht-teal)" : active ? "var(--ht-orange)" : "var(--ht-border-strong)"}`,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  color: "white",
                }}
              >
                {done && <Check size={12} strokeWidth={3} />}
                {active && <span style={{ width: 8, height: 8, background: "white", borderRadius: 999 }} />}
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
    );
  }

  return (
    <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {WORKFLOW_ORDER.map((step, i) => {
        const done = i < idx;
        const active = i === idx;
        const upcoming = i > idx;
        const isLast = i === WORKFLOW_ORDER.length - 1;
        return (
          <li key={step} style={{ display: "flex", gap: 14, paddingBottom: isLast ? 0 : 14, position: "relative" }}>
            {/* Connector */}
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
                border: `2px solid ${done ? "var(--ht-teal)" : active ? "var(--ht-orange)" : "var(--ht-border-strong)"}`,
                display: "grid",
                placeItems: "center",
                color: "white",
                flexShrink: 0,
                zIndex: 1,
                marginTop: 2,
              }}
            >
              {done ? (
                <Check size={13} strokeWidth={3} />
              ) : active ? (
                <span style={{ width: 8, height: 8, background: "white", borderRadius: 999 }} />
              ) : (
                <span style={{ width: 6, height: 6, background: "var(--ht-border-strong)", borderRadius: 999 }} />
              )}
            </div>
            <div style={{ paddingTop: 3 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: active ? 600 : done ? 500 : 500,
                  color: upcoming ? "var(--ht-ink-3)" : "var(--ht-ink)",
                }}
              >
                {step}
              </div>
              {active && changesRequested && step === "Manager Review" && (
                <div style={{ fontSize: 11, color: "var(--ht-warning)", fontWeight: 500, marginTop: 2 }}>
                  Changes requested · awaiting employee revision
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
