import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { HT } from "@/constants/colors";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
  icon,
  fullWidth,
  size = "md",
  testID,
}: {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  icon?: keyof typeof Feather.glyphMap;
  fullWidth?: boolean;
  size?: "sm" | "md" | "lg";
  testID?: string;
}) {
  const v = VARIANTS[variant];
  const isDisabled = !!disabled || !!loading;

  const handlePress = () => {
    if (isDisabled || !onPress) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress();
  };

  const sizing =
    size === "lg"
      ? { paddingVertical: 16, fontSize: 17 }
      : size === "sm"
        ? { paddingVertical: 9, fontSize: 14 }
        : { paddingVertical: 13, fontSize: 15 };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: v.bg,
          borderColor: v.border,
          paddingVertical: sizing.paddingVertical,
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
          width: fullWidth ? "100%" : undefined,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} size="small" />
      ) : (
        <View style={styles.row}>
          {icon ? <Feather name={icon} size={sizing.fontSize + 2} color={v.fg} /> : null}
          <Text style={[styles.label, { color: v.fg, fontSize: sizing.fontSize }]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: HT.navy, fg: "#FFFFFF", border: HT.navy },
  secondary: { bg: HT.surface, fg: HT.navy, border: HT.borderStrong },
  ghost: { bg: "transparent", fg: HT.navy, border: "transparent" },
  danger: { bg: HT.surface, fg: HT.danger, border: HT.danger },
  accent: { bg: HT.orange, fg: "#1F1300", border: HT.orange },
};

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontFamily: "Inter_600SemiBold", letterSpacing: 0.1 },
});
