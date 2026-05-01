import { Feather } from "@expo/vector-icons";
import {
  type ExpenseReportSummary,
  getListReportsQueryKey,
  useListReports,
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

import { HelpHeaderButton } from "@/components/help/HelpLink";
import { BrandLockup } from "@/components/ui/BrandHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { StatusPill } from "@/components/ui/StatusPill";
import { HT } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

type Filter = "all" | "active" | "draft" | "paid";

export default function ReportsTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("active");

  const query = useListReports(
    { scope: "mine" },
    {
      query: {
        staleTime: 10_000,
        queryKey: getListReportsQueryKey({ scope: "mine" }),
      },
    },
  );

  const filtered = useMemo(() => {
    const all = query.data ?? [];
    switch (filter) {
      case "draft":
        return all.filter((r) => r.status === "Draft" || r.status === "Changes Requested");
      case "paid":
        return all.filter(
          (r) =>
            r.status === "Paid Through Payroll" ||
            r.status === "Reconciled" ||
            r.status === "Voided",
        );
      case "active":
        return all.filter(
          (r) =>
            r.status !== "Paid Through Payroll" &&
            r.status !== "Reconciled" &&
            r.status !== "Voided" &&
            r.status !== "Rejected",
        );
      default:
        return all;
    }
  }, [query.data, filter]);

  const totals = useMemo(() => {
    const all = query.data ?? [];
    const inFlight = all.filter(
      (r) =>
        r.status !== "Paid Through Payroll" &&
        r.status !== "Reconciled" &&
        r.status !== "Voided" &&
        r.status !== "Rejected",
    );
    const draft = all.filter(
      (r) => r.status === "Draft" || r.status === "Changes Requested",
    );
    const sum = (xs: ExpenseReportSummary[]) =>
      xs.reduce((s, r) => s + Number(r.total ?? 0), 0);
    return { inFlightCount: inFlight.length, draftCount: draft.length, total: sum(inFlight) };
  }, [query.data]);

  const onRefresh = useCallback(() => {
    query.refetch();
  }, [query]);

  return (
    <View style={[styles.root]}>
      <View style={[styles.headerWrap, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <BrandLockup size={32} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <HelpHeaderButton />
            <Pressable
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
              onPress={() => router.push("/(tabs)/profile")}
              hitSlop={8}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(user?.fullName ?? "U")
                    .split(" ")
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>In flight</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Money value={totals.total} size={32} weight="700" style={{ color: "#FFFFFF" }} />
            <Text style={styles.heroSub}>
              {totals.inFlightCount} report{totals.inFlightCount === 1 ? "" : "s"}
            </Text>
          </View>
          {totals.draftCount > 0 ? (
            <View style={styles.heroBadge}>
              <Feather name="alert-circle" size={12} color={HT.orange} />
              <Text style={styles.heroBadgeText}>
                {totals.draftCount} need your attention
              </Text>
            </View>
          ) : null}

          <View style={{ marginTop: 14, flexDirection: "row", gap: 10 }}>
            <PrimaryButton
              title="New report"
              icon="plus"
              variant="accent"
              onPress={() => router.push("/report/new")}
            />
          </View>
        </View>

        <View style={styles.filters}>
          {([
            ["active", "Active"],
            ["draft", "Drafts"],
            ["paid", "Paid"],
            ["all", "All"],
          ] as [Filter, string][]).map(([key, label]) => {
            const sel = filter === key;
            return (
              <Pressable
                key={key}
                onPress={() => setFilter(key)}
                style={({ pressed }) => [
                  styles.filterChip,
                  sel && { backgroundColor: HT.navy, borderColor: HT.navy },
                  pressed && !sel && { backgroundColor: HT.surfaceAlt },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    sel && { color: "#FFFFFF" },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
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
            title="Couldn't load reports"
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
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: insets.bottom + 80,
            paddingTop: 8,
          }}
          renderItem={({ item }) => (
            <ReportRow item={item} onPress={() => router.push(`/report/${item.id}`)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <EmptyState
              icon="file-text"
              title="No reports here yet"
              body="Tap New report to start a draft. Snap receipts as you go and submit for review when you're ready."
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

function ReportRow({
  item,
  onPress,
}: {
  item: ExpenseReportSummary;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: HT.surfaceAlt }]}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.code}>{item.displayCode}</Text>
          {item.needsReceipt ? (
            <View style={styles.warnDot}>
              <Feather name="paperclip" size={10} color={HT.warning} />
              <Text style={styles.warnText}>missing receipt</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          <StatusPill status={item.status} size="xs" />
          <Text style={styles.meta}>
            {item.lineCount} line{item.lineCount === 1 ? "" : "s"} · {item.receiptCount} rcpt
          </Text>
        </View>
      </View>
      <View style={styles.right}>
        <Money value={item.total} size={18} weight="700" />
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
  iconBtn: { padding: 4 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: HT.tintNavy,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: "Inter_700Bold", color: HT.navy, fontSize: 13 },
  heroCard: {
    backgroundColor: HT.navy,
    borderRadius: 18,
    padding: 18,
    overflow: "hidden",
  },
  heroLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  heroSub: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
  },
  heroBadge: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: "rgba(254,160,2,0.16)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  heroBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: HT.orangeLight,
  },
  filters: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    marginBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HT.borderStrong,
    backgroundColor: HT.surface,
  },
  filterText: { fontFamily: "Inter_600SemiBold", color: HT.ink2, fontSize: 13 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: HT.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HT.border,
  },
  code: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: HT.teal,
    letterSpacing: 0.4,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: HT.ink, marginTop: 2 },
  meta: { fontFamily: "Inter_500Medium", fontSize: 12, color: HT.ink3 },
  right: { alignItems: "flex-end", gap: 4 },
  warnDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: HT.tintOrange,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  warnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: HT.warning,
    letterSpacing: 0.2,
  },
});
