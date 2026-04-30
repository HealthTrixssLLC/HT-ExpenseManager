import React from "react";
import { type StyleProp, StyleSheet, Text, type TextStyle } from "react-native";

import { HT } from "@/constants/colors";

export function formatUsd(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "$0.00";
  const abs = Math.abs(n);
  return `${n < 0 ? "-" : ""}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function Money({
  value,
  size = 16,
  weight = "600",
  style,
}: {
  value: string | number | null | undefined;
  size?: number;
  weight?: "400" | "500" | "600" | "700";
  style?: StyleProp<TextStyle>;
}) {
  const family =
    weight === "700"
      ? "Inter_700Bold"
      : weight === "600"
        ? "Inter_600SemiBold"
        : weight === "500"
          ? "Inter_500Medium"
          : "Inter_400Regular";
  return (
    <Text style={[styles.base, { fontSize: size, fontFamily: family }, style]}>
      {formatUsd(value)}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    color: HT.ink,
    fontVariant: ["tabular-nums"],
  },
});
