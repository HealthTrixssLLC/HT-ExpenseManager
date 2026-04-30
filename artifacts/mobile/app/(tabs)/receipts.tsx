import { Feather } from "@expo/vector-icons";
import {
  type ExpenseReportSummary,
  useListReports,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
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
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { Money } from "@/components/ui/Money";
import { HT } from "@/constants/colors";

export default function ReceiptsTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const query = useListReports({ scope: "mine" }, { query: { staleTime: 10_000 } });

  const editableReports = useMemo(() => {
    return (query.data ?? []).filter(
      (r) => r.status === "Draft" || r.status === "Changes Requested",
    );
  }, [query.data]);

  const onRefresh = useCallback(() => {
    query.refetch();
  }, [query]);

  return (
    <View style={styles.root}>
      <View style={[styles.headerWrap, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <BrandLockup size={32} />
        </View>
        <Text style={styles.h1}>Capture a receipt</Text>
        <Text style={styles.h1Sub}>
          Pick the report you want to attach to. You can also add a receipt from inside any line item.
        </Text>
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
          data={editableReports}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: insets.bottom + 80,
            paddingTop: 8,
          }}
          renderItem={({ item }) => (
            <ReportCaptureRow
              item={item}
              onCapture={() => router.push(`/report/${item.id}/capture`)}
              onOpen={() => router.push(`/report/${item.id}`)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <EmptyState
              icon="image"
              title="No editable reports"
              body="Receipts can only be attached to Draft or Changes Requested reports. Start a new report to capture a receipt."
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

function ReportCaptureRow({
  item,
  onCapture,
  onOpen,
}: {
  item: ExpenseReportSummary;
  onCapture: () => void;
  onOpen: () => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.code}>{item.displayCode}</Text>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.meta}>
          {item.receiptCount} receipt{item.receiptCount === 1 ? "" : "s"} ·{" "}
          <Money value={item.total} size={12} weight="500" style={{ color: HT.ink3 }} />
        </Text>
      </Pressable>
      <Pressable
        onPress={onCapture}
        style={({ pressed }) => [styles.captureBtn, pressed && { opacity: 0.85 }]}
      >
        <Feather name="camera" size={18} color="#FFFFFF" />
        <Text style={styles.captureBtnText}>Capture</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HT.canvas },
  headerWrap: { paddingHorizontal: 16, paddingBottom: 8, backgroundColor: HT.canvas },
  headerRow: { marginBottom: 14 },
  h1: { fontFamily: "Inter_700Bold", fontSize: 24, color: HT.ink, marginTop: 2 },
  h1Sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: HT.ink3,
    marginTop: 4,
    lineHeight: 20,
  },
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
    fontSize: 11,
    color: HT.teal,
    letterSpacing: 0.4,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: HT.ink, marginTop: 2 },
  meta: { fontFamily: "Inter_500Medium", fontSize: 12, color: HT.ink3, marginTop: 4 },
  captureBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: HT.navy,
  },
  captureBtnText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
