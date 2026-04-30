import type { WorkflowStatus } from "@workspace/api-client-react";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { HT } from "@/constants/colors";
import {
  OFF_RAMPS,
  STATUS_TINTS,
  WORKFLOW_ORDER,
} from "@/constants/status";

export function StatusTracker({ current }: { current: WorkflowStatus }) {
  const isOffRamp = OFF_RAMPS.includes(current);
  const idx = isOffRamp ? -1 : WORKFLOW_ORDER.indexOf(current);

  return (
    <View style={styles.container}>
      {WORKFLOW_ORDER.map((step, i) => {
        const reached = !isOffRamp && i <= idx;
        const isCurrent = !isOffRamp && i === idx;
        const tint = STATUS_TINTS[step];
        const isLast = i === WORKFLOW_ORDER.length - 1;
        return (
          <View key={step} style={styles.row}>
            <View style={styles.railCol}>
              <View
                style={[
                  styles.dot,
                  reached
                    ? { backgroundColor: tint.dot, borderColor: tint.dot }
                    : { backgroundColor: HT.surface, borderColor: HT.borderStrong },
                  isCurrent && { transform: [{ scale: 1.15 }] },
                ]}
              />
              {!isLast && (
                <View
                  style={[
                    styles.line,
                    { backgroundColor: reached && i < idx ? tint.dot : HT.border },
                  ]}
                />
              )}
            </View>
            <View style={styles.label}>
              <Text
                style={[
                  styles.stepText,
                  reached ? { color: HT.ink } : { color: HT.ink4 },
                  isCurrent && { fontFamily: "Inter_700Bold" },
                ]}
              >
                {step}
              </Text>
              {isCurrent && (
                <Text style={styles.currentBadge}>Current step</Text>
              )}
            </View>
          </View>
        );
      })}
      {isOffRamp && (
        <View style={styles.offRamp}>
          <View
            style={[
              styles.dot,
              {
                backgroundColor: STATUS_TINTS[current].dot,
                borderColor: STATUS_TINTS[current].dot,
              },
            ]}
          />
          <Text style={[styles.stepText, { fontFamily: "Inter_700Bold", color: HT.ink, marginLeft: 12 }]}>
            {current}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "stretch" },
  railCol: { width: 24, alignItems: "center" },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    marginTop: 2,
  },
  line: { width: 2, flex: 1, marginTop: 2, marginBottom: -2 },
  label: { flex: 1, paddingBottom: 16, paddingLeft: 12 },
  stepText: { fontSize: 14, fontFamily: "Inter_500Medium", color: HT.ink2 },
  currentBadge: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: HT.teal,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  offRamp: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: HT.border,
  },
});
