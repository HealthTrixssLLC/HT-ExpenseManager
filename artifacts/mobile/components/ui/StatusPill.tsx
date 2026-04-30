import type { WorkflowStatus } from "@workspace/api-client-react";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { STATUS_TINTS } from "@/constants/status";

export function StatusPill({
  status,
  size = "sm",
}: {
  status: WorkflowStatus;
  size?: "xs" | "sm" | "md";
}) {
  const t = STATUS_TINTS[status];
  const padV = size === "xs" ? 2 : size === "md" ? 6 : 4;
  const padH = size === "xs" ? 8 : size === "md" ? 12 : 10;
  const fs = size === "xs" ? 11 : size === "md" ? 13 : 12;
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: t.bg,
          paddingVertical: padV,
          paddingHorizontal: padH,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: t.dot }]} />
      <Text style={[styles.label, { color: t.fg, fontSize: fs }]} numberOfLines={1}>
        {status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontFamily: "Inter_600SemiBold", letterSpacing: 0.1 },
});
