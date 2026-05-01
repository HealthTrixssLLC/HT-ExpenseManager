import { Feather } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HT } from "@/constants/colors";
import {
  HELP_CATEGORIES,
  getTopic,
  searchTopics,
} from "@/lib/help/content";

export default function HelpIndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const results = useMemo(() => searchTopics(q), [q]);

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
            testID="help-back"
          >
            <Feather name="chevron-left" size={22} color={HT.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Help center</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color={HT.ink3} />
          <TextInput
            testID="help-search-input"
            placeholder="Search topics — 'reject', 'reconcile', 'receipts'…"
            placeholderTextColor={HT.ink4}
            value={q}
            onChangeText={setQ}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ("")} hitSlop={8}>
              <Feather name="x-circle" size={16} color={HT.ink3} />
            </Pressable>
          )}
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: insets.bottom + 32,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {q.trim() ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {results.length} match{results.length === 1 ? "" : "es"}
              </Text>
              {results.length === 0 ? (
                <Text style={styles.emptyText}>
                  No topics match "{q}". Try a simpler word.
                </Text>
              ) : (
                results.map((t) => (
                  <Pressable
                    key={t.id}
                    testID={`help-result-${t.id}`}
                    onPress={() => router.push(`/help/${t.id}` as never)}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { backgroundColor: HT.surfaceAlt },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{t.title}</Text>
                      <Text style={styles.rowSummary}>{t.summary}</Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={HT.ink4} />
                  </Pressable>
                ))
              )}
            </View>
          ) : (
            HELP_CATEGORIES.map((cat) => (
              <View key={cat.id} style={styles.section}>
                <Text style={styles.sectionTitle}>{cat.title}</Text>
                {cat.description ? (
                  <Text style={styles.sectionDesc}>{cat.description}</Text>
                ) : null}
                <View style={styles.sectionCard}>
                  {cat.topicIds.map((tid, idx) => {
                    const topic = getTopic(tid);
                    if (!topic) return null;
                    return (
                      <Pressable
                        key={tid}
                        testID={`help-topic-link-${tid}`}
                        onPress={() => router.push(`/help/${tid}` as never)}
                        style={({ pressed }) => [
                          styles.topicRow,
                          idx > 0 && {
                            borderTopWidth: StyleSheet.hairlineWidth,
                            borderTopColor: HT.border,
                          },
                          pressed && { backgroundColor: HT.surfaceAlt },
                        ]}
                      >
                        <Text style={styles.topicTitle}>{topic.title}</Text>
                        <Feather name="chevron-right" size={16} color={HT.ink4} />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          )}
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
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: HT.ink,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: HT.surface,
    borderWidth: 1,
    borderColor: HT.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: HT.ink,
    padding: 0,
  },
  section: { marginBottom: 18 },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: HT.ink,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  sectionDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12.5,
    color: HT.ink3,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: HT.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HT.border,
    overflow: "hidden",
  },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  topicTitle: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14.5, color: HT.ink },
  row: {
    backgroundColor: HT.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HT.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 8,
  },
  rowTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: HT.ink },
  rowSummary: {
    fontFamily: "Inter_400Regular",
    fontSize: 12.5,
    color: HT.ink3,
    marginTop: 2,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: HT.ink3,
    paddingHorizontal: 4,
  },
});
