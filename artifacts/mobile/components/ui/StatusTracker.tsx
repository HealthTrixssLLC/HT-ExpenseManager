import { Feather } from "@expo/vector-icons";
import type { WorkflowStatus } from "@workspace/api-client-react";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { HT } from "@/constants/colors";
import { STATUS_TINTS, WORKFLOW_ORDER } from "@/constants/status";

type OffRamp = {
  status: Extract<WorkflowStatus, "Changes Requested" | "Rejected" | "Voided">;
  fromStep: WorkflowStatus;
  tone: "warning" | "danger" | "muted";
  icon: React.ComponentProps<typeof Feather>["name"];
};

const OFFRAMPS: OffRamp[] = [
  { status: "Changes Requested", fromStep: "Manager Review", tone: "warning", icon: "rotate-ccw" },
  { status: "Rejected",          fromStep: "Manager Review", tone: "danger",  icon: "x" },
  { status: "Voided",            fromStep: "Submitted",      tone: "muted",   icon: "slash" },
];

const TONE: Record<OffRamp["tone"], { fg: string; bg: string; border: string }> = {
  warning: { fg: "#8A4F00",     bg: HT.tintOrange,  border: HT.orange },
  danger:  { fg: HT.danger,     bg: HT.tintDanger,  border: HT.danger },
  muted:   { fg: HT.ink3,       bg: HT.tintGrey,    border: HT.lightGrey },
};

/**
 * Vertical workflow tracker. Renders the 10 forward steps plus the three
 * off-ramps (Changes Requested, Rejected, Voided) as visible side branches
 * so the diagram always communicates the full workflow model. The current
 * step (or active off-ramp) is highlighted; when on an off-ramp, the step
 * it branched from is paused.
 */
export function StatusTracker({ current }: { current: WorkflowStatus }) {
  const offRamp = OFFRAMPS.find((o) => o.status === current);
  const linearActive: WorkflowStatus = offRamp ? offRamp.fromStep : current;
  const idx = WORKFLOW_ORDER.indexOf(linearActive);
  const isOnLinear = !offRamp;
  const pauseAt = offRamp ? offRamp.fromStep : null;

  // Sync Error: render terminal block (no off-ramp anchor)
  if (current === "Sync Error") {
    return (
      <View style={styles.container}>
        <View style={[styles.errorRamp, { backgroundColor: HT.tintDanger, borderColor: HT.danger }]}>
          <Feather name="alert-octagon" size={16} color={HT.danger} />
          <Text style={[styles.errorRampText, { color: HT.danger }]}>{current}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {WORKFLOW_ORDER.map((step, i) => {
        const done = i < idx;
        const active = i === idx && isOnLinear;
        const paused = step === pauseAt;
        const upcoming = i > idx;
        const isLast = i === WORKFLOW_ORDER.length - 1;
        const branches = OFFRAMPS.filter((o) => o.fromStep === step);
        const tint = STATUS_TINTS[step];

        return (
          <View key={step} style={styles.row}>
            <View style={styles.railCol}>
              {!isLast && (
                <View
                  style={[
                    styles.line,
                    { backgroundColor: done ? HT.teal : HT.border },
                  ]}
                />
              )}
              <View
                style={[
                  styles.dot,
                  done
                    ? { backgroundColor: HT.teal, borderColor: HT.teal }
                    : active
                      ? { backgroundColor: HT.orange, borderColor: HT.orange }
                      : paused
                        ? { backgroundColor: HT.surface, borderColor: HT.orange }
                        : { backgroundColor: HT.surface, borderColor: HT.borderStrong },
                ]}
              >
                {done ? (
                  <Feather name="check" size={11} color="#FFFFFF" />
                ) : active ? (
                  <View style={styles.activeDotInner} />
                ) : paused ? (
                  <View style={[styles.activeDotInner, { backgroundColor: HT.orange }]} />
                ) : (
                  <View style={styles.upcomingDotInner} />
                )}
              </View>
            </View>

            <View style={styles.label}>
              <Text
                style={[
                  styles.stepText,
                  upcoming ? { color: HT.ink4 } : { color: HT.ink },
                  (active || paused) && { fontFamily: "Inter_700Bold" },
                ]}
              >
                {step}
              </Text>
              {paused ? (
                <Text style={styles.pausedText}>Paused — awaiting employee revision</Text>
              ) : active ? (
                <Text style={[styles.currentBadge, { color: tint.fg }]}>Current step</Text>
              ) : null}

              {branches.length > 0 ? (
                <View style={styles.branches}>
                  {branches.map((b) => {
                    const isActive = offRamp?.status === b.status;
                    const tone = TONE[b.tone];
                    return (
                      <View key={b.status} style={styles.branchRow}>
                        <View
                          style={[
                            styles.branchPill,
                            isActive
                              ? { backgroundColor: tone.bg, borderColor: tone.border, borderStyle: "solid" }
                              : { backgroundColor: "transparent", borderColor: HT.borderStrong, borderStyle: "dashed" },
                          ]}
                        >
                          <Feather
                            name={b.icon}
                            size={11}
                            color={isActive ? tone.fg : HT.ink3}
                          />
                          <Text
                            style={[
                              styles.branchText,
                              { color: isActive ? tone.fg : HT.ink3 },
                            ]}
                          >
                            {b.status}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}

      {/* Reconciled is terminal-good. Off-ramps render inline above as branches. */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "stretch", minHeight: 38 },
  railCol: { width: 24, alignItems: "center", position: "relative" },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  activeDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },
  upcomingDotInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: HT.borderStrong },
  line: {
    position: "absolute",
    left: 11,
    top: 24,
    bottom: -8,
    width: 2,
  },
  label: { flex: 1, paddingBottom: 16, paddingLeft: 12, paddingTop: 3 },
  stepText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  currentBadge: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  pausedText: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#8A4F00",
  },
  branches: { marginTop: 6, gap: 6 },
  branchRow: { flexDirection: "row", alignItems: "center" },
  branchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  branchText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  errorRamp: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorRampText: { fontSize: 13, fontFamily: "Inter_700Bold" },
});
