import { Feather } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RenderHelpBlock } from "@/components/help/HelpBlocks";
import { HT } from "@/constants/colors";
import {
  getCategoryTitle,
  getTopic,
} from "@/lib/help/content";

export default function HelpTopicScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const id = (params.id ?? "") as string;
  const topic = getTopic(id);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/help" as never);
  };

  if (!topic) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.root, { paddingTop: insets.top + 4 }]}>
          <Header title="Topic not found" onBack={goBack} />
          <View style={{ padding: 20 }}>
            <Text style={styles.notFound}>
              We couldn't find a help topic with id "{id}".
            </Text>
            <Pressable
              onPress={() => router.replace("/help" as never)}
              style={({ pressed }) => [
                styles.cta,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Feather name="book-open" size={14} color={HT.surface} />
              <Text style={styles.ctaText}>Browse Help center</Text>
            </Pressable>
          </View>
        </View>
      </>
    );
  }

  const related = (topic.related ?? []).map((rid) => getTopic(rid)).filter(Boolean);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.root, { paddingTop: insets.top + 4 }]}>
        <Header title="Help" onBack={goBack} />
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 32,
          }}
        >
          <Text style={styles.crumb}>{getCategoryTitle(topic.category)}</Text>
          <Text style={styles.title} testID="help-topic-title">
            {topic.title}
          </Text>
          <Text style={styles.summary}>{topic.summary}</Text>

          {(topic.roles?.length || topic.whoCanDo) && (
            <View style={styles.metaWrap}>
              {topic.whoCanDo ? (
                <Text style={styles.whoCanDo}>{topic.whoCanDo}</Text>
              ) : null}
              {topic.roles?.length ? (
                <View style={styles.roleRow}>
                  {topic.roles.map((r) => (
                    <View key={r} style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{r}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          )}

          <View style={{ marginTop: 14 }}>
            {topic.blocks.map((b, i) => (
              <RenderHelpBlock key={i} block={b} />
            ))}
          </View>

          {related.length > 0 && (
            <View style={{ marginTop: 18 }}>
              <Text style={styles.sectionLabel}>Related topics</Text>
              {related.map((rt) =>
                rt ? (
                  <Pressable
                    key={rt.id}
                    testID={`help-related-${rt.id}`}
                    onPress={() => router.push(`/help/${rt.id}` as never)}
                    style={({ pressed }) => [
                      styles.relatedRow,
                      pressed && { backgroundColor: HT.surfaceAlt },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.relatedTitle}>{rt.title}</Text>
                      <Text style={styles.relatedSummary}>{rt.summary}</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={HT.ink4} />
                  </Pressable>
                ) : null,
              )}
            </View>
          )}

          <Pressable
            onPress={() => router.replace("/help" as never)}
            style={({ pressed }) => [
              styles.browseAll,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Feather name="book-open" size={14} color={HT.navy} />
            <Text style={styles.browseAllText}>Browse all help topics</Text>
          </Pressable>
        </ScrollView>
      </View>
    </>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.headerBar}>
      <Pressable
        onPress={onBack}
        hitSlop={10}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
        testID="help-back"
      >
        <Feather name="chevron-left" size={22} color={HT.ink} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 32 }} />
    </View>
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
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: HT.ink,
  },
  crumb: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: HT.ink3,
    marginTop: 4,
    marginBottom: 6,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: HT.ink,
    letterSpacing: -0.2,
  },
  summary: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: HT.ink3,
    marginTop: 6,
    lineHeight: 20,
  },
  metaWrap: { marginTop: 12, gap: 6 },
  whoCanDo: { fontFamily: "Inter_500Medium", fontSize: 13, color: HT.ink2 },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: HT.tintNavy,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HT.border,
  },
  roleBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: HT.navy },
  sectionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: HT.ink,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  relatedRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: HT.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HT.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
    gap: 8,
  },
  relatedTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: HT.ink },
  relatedSummary: {
    fontFamily: "Inter_400Regular",
    fontSize: 12.5,
    color: HT.ink3,
    marginTop: 2,
  },
  browseAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: HT.surface,
    borderWidth: 1,
    borderColor: HT.border,
    borderRadius: 10,
    marginTop: 22,
  },
  browseAllText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: HT.navy,
  },
  notFound: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: HT.ink2,
    marginBottom: 14,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: HT.navy,
    borderRadius: 10,
  },
  ctaText: { fontFamily: "Inter_700Bold", fontSize: 13, color: HT.surface },
});
