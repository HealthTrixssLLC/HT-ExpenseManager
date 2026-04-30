import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { HT } from "@/constants/colors";

export function Section({
  title,
  action,
  children,
  style,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.wrap, style]}>
      {title || action ? (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : <View />}
          {action}
        </View>
      ) : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function Row({
  label,
  value,
  last,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HT.border },
      ]}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexShrink: 1 }}>
        {typeof value === "string" || typeof value === "number" ? (
          <Text style={styles.value}>{value}</Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: HT.ink3,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: HT.surface,
    borderRadius: 14,
    marginHorizontal: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HT.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  label: { fontFamily: "Inter_500Medium", fontSize: 15, color: HT.ink2 },
  value: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: HT.ink, textAlign: "right" },
});
