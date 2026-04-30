import { Feather } from "@expo/vector-icons";
import {
  type ExpenseReportSummary,
  getManagerQueueQueryKey,
  useManagerQueue,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandLockup } from "@/components/ui/BrandHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { StatusPill } from "@/components/ui/StatusPill";
import { HT } from "@/constants/colors";

type SortMode = "aging" | "newest" | "amount";

const SORTS: { id: SortMode; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: "aging", label: "Oldest", icon: "clock" },
  { id: "newest", label: "Newest", icon: "calendar" },
  { id: "amount", label: "Amount", icon: "dollar-sign" },
];

export default function InboxTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sortMode, setSortMode] = useState<SortMode>("aging");
  const query = useManagerQueue({
    query: { staleTime: 10_000, queryKey: getManagerQueueQueryKey() },
  });

  const onRefresh = useCallback(() => {
    query.refetch();
  }, [query]);

  const sortedData = useMemo(() => {
    const arr = [...(query.data ?? [])];
    if (sortMode === "aging") {
      arr.sort((a, b) => b.ageDays - a.ageDays);
    } else if (sortMode === "newest") {
      arr.sort(
        (a, b) =>
          new Date(b.submittedAt ?? b.updatedAt).getTime() -
          new Date(a.submittedAt ?? a.updatedAt).getTime(),
      );
    } else {
      arr.sort((a, b) => Number(b.total) - Number(a.total));
    }
    return arr;
  }, [query.data, sortMode]);

  return (
    <View style={styles.root}>
      <View style={[styles.headerWrap, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <BrandLockup size={32} />
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {query.data?.length ?? 0} pending
            </Text>
          </View>
        </View>
        <Text style={styles.h1}>Manager review</Text>
        <Text style={styles.h1Sub}>
          Reports waiting on your approval. Tap a report to review line items, receipts, and approve.
        </Text>

        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort by</Text>
          <View style={styles.sortChips}>
            {SORTS.map((s) => {
              const sel = sortMode === s.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setSortMode(s.id)}
                  style={({ pressed }) => [
                    styles.sortChip,
                    sel && {
                      backgroundColor: HT.tintNavy,
                      borderColor: HT.navy,
                    },
                    pressed && !sel && { backgroundColor: HT.surfaceAlt },
                  ]}
                >
                  <Feather
                    name={s.icon}
                    size={12}
                    color={sel ? HT.navy : HT.ink3}
                  />
                  <Text
                    style={[
                      styles.sortChipText,
                      sel && { color: HT.navy },
                    ]}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {query.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={HT.navy} />
        </View>
      ) : query.isError ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
          <EmptyState
            icon="alert-triangle"
            title="Couldn't load the queue"
            body={query.error instanceof Error ? query.error.message : "Something went wrong."}
            action={
              <PrimaryButton
                title="Try again"
                variant="secondary"
                onPress={() => query.refetch()}
              />
            }
          />
        </View>
      ) : (
        <FlatList
          data={sortedData}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: insets.bottom + 80,
            paddingTop: 8,
          }}
          renderItem={({ item }) => (
            <QueueRow item={item} onPress={() => router.push(`/report/${item.id}`)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <EmptyState
              icon="check-circle"
              title="Inbox zero"
              body="No reports are currently waiting on your review. New submissions will appear here automatically."
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching && !query.isLoading}
              onRefresh={onRefresh}
              tintColor={HT.navy}
            />
          }
        />
      )}
    </View>
  );
}

function QueueRow({
  item,
  onPress,
}: {
  item: ExpenseReportSummary;
  onPress: () => void;
}) {
  const initials = item.employee.fullName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: HT.surfaceAlt }]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.code}>{item.displayCode}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.who}>
          {item.employee.fullName}
          {item.departmentName ? ` · ${item.departmentName}` : ""}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          <StatusPill status={item.status} size="xs" />
          <Text style={styles.meta}>
            {item.lineCount} ln · {item.receiptCount} rc · {item.ageDays}d old
          </Text>
        </View>
      </View>
      <View style={styles.right}>
        <Money value={item.total} size={17} weight="700" />
        <Feather name="chevron-right" size={18} color={HT.ink4} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HT.canvas },
  headerWrap: { paddingHorizontal: 16, paddingBottom: 8, backgroundColor: HT.canvas },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: HT.tintTeal,
  },
  countBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: HT.teal },
  h1: { fontFamily: "Inter_700Bold", fontSize: 24, color: HT.ink, marginTop: 2 },
  h1Sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: HT.ink3,
    marginTop: 4,
    lineHeight: 20,
  },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  sortLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: HT.ink3,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  sortChips: { flexDirection: "row", gap: 6, flex: 1, flexWrap: "wrap" },
  sortChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HT.borderStrong,
    backgroundColor: HT.surface,
  },
  sortChipText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: HT.ink2 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: HT.surface,
    borderRadius: 14,
    padding: 12,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HT.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: HT.tintNavy,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: "Inter_700Bold", color: HT.navy, fontSize: 13 },
  code: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: HT.teal,
    letterSpacing: 0.4,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: HT.ink, marginTop: 1 },
  who: { fontFamily: "Inter_400Regular", fontSize: 12, color: HT.ink3, marginTop: 2 },
  meta: { fontFamily: "Inter_500Medium", fontSize: 12, color: HT.ink3 },
  right: { alignItems: "flex-end", gap: 4, marginLeft: 4 },
});
