import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { HT } from "@/constants/colors";

/**
 * Compact "Help" pill for screen headers and forms.
 */
export function HelpLink({
  topicId,
  label = "Help",
  testID,
}: {
  topicId: string;
  label?: string;
  testID?: string;
}) {
  const router = useRouter();
  return (
    <Pressable
      testID={testID ?? `help-link-${topicId}`}
      onPress={() => router.push(`/help/${topicId}` as never)}
      hitSlop={8}
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]}
    >
      <Feather name="help-circle" size={13} color={HT.navy} />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

/**
 * Simple icon-only help button for tab-bar-style headers.
 */
export function HelpHeaderButton({
  topicId = "",
  testID,
}: {
  topicId?: string;
  testID?: string;
}) {
  const router = useRouter();
  return (
    <Pressable
      testID={testID ?? "help-header-button"}
      onPress={() =>
        router.push((topicId ? `/help/${topicId}` : "/help") as never)
      }
      hitSlop={10}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
    >
      <Feather name="help-circle" size={20} color={HT.navy} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: HT.border,
    backgroundColor: HT.surface,
  },
  text: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: HT.navy,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: HT.tintNavy,
    alignItems: "center",
    justifyContent: "center",
  },
});
