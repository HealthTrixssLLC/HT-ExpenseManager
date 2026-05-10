import { Feather } from "@expo/vector-icons";
import {
  EULA_COMPANY,
  EULA_EFFECTIVE_DATE,
  EULA_INTRO,
  EULA_PRODUCT_NAME,
  EULA_SECTIONS,
  EULA_VERSION,
} from "@workspace/legal";
import { Stack, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HT } from "@/constants/colors";

export default function EulaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.root, { paddingTop: insets.top + 4 }]}>
        <View style={styles.headerBar}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/(tabs)/profile" as never);
            }}
            hitSlop={10}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            testID="eula-back"
          >
            <Feather name="chevron-left" size={22} color={HT.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>End User Agreement</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 32 },
          ]}
        >
          <Text style={styles.title}>
            {EULA_PRODUCT_NAME} End User Agreement
          </Text>
          <Text style={styles.meta}>
            Version {EULA_VERSION} · Effective {EULA_EFFECTIVE_DATE}
          </Text>
          <Text style={styles.body}>{EULA_INTRO}</Text>
          {EULA_SECTIONS.map((section) => (
            <View key={section.id} style={styles.section}>
              <Text style={styles.heading}>{section.heading}</Text>
              {section.paragraphs.map((p, i) => (
                <Text key={i} style={styles.body}>
                  {p}
                </Text>
              ))}
            </View>
          ))}
          <Text style={styles.footer}>
            © {new Date().getFullYear()} {EULA_COMPANY}. All rights reserved.
          </Text>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HT.canvas },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: HT.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: HT.border,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: HT.ink,
  },
  scroll: { padding: 20 },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: HT.ink,
    letterSpacing: -0.2,
  },
  meta: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: HT.ink3,
    marginTop: 4,
    marginBottom: 14,
  },
  section: { marginTop: 18 },
  heading: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: HT.ink,
    marginBottom: 6,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
    color: HT.ink2,
    marginBottom: 8,
  },
  footer: {
    marginTop: 24,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HT.border,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: HT.ink3,
  },
});
