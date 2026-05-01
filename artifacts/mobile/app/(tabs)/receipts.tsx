import { Feather } from "@expo/vector-icons";
import {
  type ExpenseReport,
  type ExpenseReportSummary,
  type Receipt,
  getGetReportQueryKey,
  getListReceiptsQueryKey,
  getListReportsQueryKey,
  useGetReport,
  useListReceipts,
  useListReports,
  useUpdateReceipt,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
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
import { ReceiptThumb } from "@/components/ui/ReceiptThumb";
import { ReceiptViewer } from "@/components/ui/ReceiptViewer";
import { StatusPill } from "@/components/ui/StatusPill";
import { HT } from "@/constants/colors";
import { isEditable } from "@/constants/status";

export default function ReceiptsTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const query = useListReports(
    { scope: "mine" },
    {
      query: {
        staleTime: 10_000,
        queryKey: getListReportsQueryKey({ scope: "mine" }),
      },
    },
  );
  const [viewer, setViewer] = useState<{
    receipt: Receipt;
    reportId: string;
    editable: boolean;
  } | null>(null);

  const onRefresh = useCallback(() => {
    query.refetch();
  }, [query]);

  // Lazily load lines for the active report so the viewer can offer attach/detach.
  const activeReportQ = useGetReport(viewer?.reportId ?? "", {
    query: {
      enabled: !!viewer && viewer.editable,
      staleTime: 30_000,
      queryKey: getGetReportQueryKey(viewer?.reportId ?? ""),
    },
  });
  const activeReport = activeReportQ.data as ExpenseReport | undefined;
  const updateReceipt = useUpdateReceipt();

  // Show reports that have at least one receipt OR are editable (so user can attach)
  const reportsWithReceipts = (query.data ?? []).filter(
    (r) => r.receiptCount > 0 || isEditable(r.status),
  );

  return (
    <View style={styles.root}>
      <View style={[styles.headerWrap, { paddingTop: insets.top + 8 }]}>
        <View
          style={[
            styles.headerRow,
            { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
          ]}
        >
          <BrandLockup size={32} />
          <HelpHeaderButton topicId="upload-receipts" />
        </View>
        <Text style={styles.h1}>Receipts</Text>
        <Text style={styles.h1Sub}>
          Tap any thumbnail to view it. Use Capture to add new receipts to a Draft or Changes Requested report.
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
          data={reportsWithReceipts}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: insets.bottom + 80,
            paddingTop: 8,
          }}
          renderItem={({ item }) => (
            <ReportReceiptsCard
              item={item}
              onCapture={() => router.push(`/report/${item.id}/capture`)}
              onOpen={() => router.push(`/report/${item.id}`)}
              onPickReceipt={(r) =>
                setViewer({
                  receipt: r,
                  reportId: item.id,
                  editable: isEditable(item.status),
                })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <EmptyState
              icon="image"
              title="No receipts yet"
              body="Receipts you capture or upload will show here, grouped by report."
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

      <ReceiptViewer
        receipt={viewer?.receipt ?? null}
        visible={viewer !== null}
        onClose={() => setViewer(null)}
        lines={viewer?.editable ? activeReport?.lineItems : undefined}
        canEdit={!!viewer?.editable}
        isMutating={updateReceipt.isPending}
        onAttach={async (rcpt, lineId) => {
          try {
            const updated = await updateReceipt.mutateAsync({
              id: rcpt.id,
              data: { lineItemId: lineId },
            });
            setViewer((v) => (v ? { ...v, receipt: updated } : v));
            if (viewer) activeReportQ.refetch();
          } catch (err) {
            Alert.alert(
              "Couldn't attach receipt",
              err instanceof Error ? err.message : "Please try again.",
            );
          }
        }}
        onDetach={async (rcpt) => {
          try {
            const updated = await updateReceipt.mutateAsync({
              id: rcpt.id,
              data: { lineItemId: null },
            });
            setViewer((v) => (v ? { ...v, receipt: updated } : v));
            if (viewer) activeReportQ.refetch();
          } catch (err) {
            Alert.alert(
              "Couldn't detach receipt",
              err instanceof Error ? err.message : "Please try again.",
            );
          }
        }}
      />
    </View>
  );
}

function ReportReceiptsCard({
  item,
  onCapture,
  onOpen,
  onPickReceipt,
}: {
  item: ExpenseReportSummary;
  onCapture: () => void;
  onOpen: () => void;
  onPickReceipt: (r: Receipt) => void;
}) {
  const editable = isEditable(item.status);
  const receiptsQ = useListReceipts(item.id, {
    query: {
      enabled: item.receiptCount > 0,
      staleTime: 30_000,
      queryKey: getListReceiptsQueryKey(item.id),
    },
  });

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [styles.cardHead, pressed && { opacity: 0.7 }]}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.code}>{item.displayCode}</Text>
            <StatusPill status={item.status} size="sm" />
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.meta}>
            {item.receiptCount} receipt{item.receiptCount === 1 ? "" : "s"} ·{" "}
            <Money value={item.total} size={12} weight="500" style={{ color: HT.ink3 }} />
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={HT.ink4} />
      </Pressable>

      {item.receiptCount > 0 ? (
        receiptsQ.isLoading ? (
          <View style={styles.thumbLoading}>
            <ActivityIndicator color={HT.navy} size="small" />
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbStrip}
          >
            {(receiptsQ.data ?? []).map((r) => (
              <ReceiptThumb
                key={r.id}
                receipt={r}
                size={72}
                onPress={() => onPickReceipt(r)}
              />
            ))}
          </ScrollView>
        )
      ) : null}

      {editable ? (
        <Pressable
          onPress={onCapture}
          style={({ pressed }) => [styles.captureBtn, pressed && { opacity: 0.85 }]}
        >
          <Feather name="camera" size={16} color="#FFFFFF" />
          <Text style={styles.captureBtnText}>Capture receipt</Text>
        </Pressable>
      ) : null}
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
    backgroundColor: HT.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HT.border,
    overflow: "hidden",
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 8,
  },
  code: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: HT.teal,
    letterSpacing: 0.4,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: HT.ink, marginTop: 4 },
  meta: { fontFamily: "Inter_500Medium", fontSize: 12, color: HT.ink3, marginTop: 4 },
  thumbStrip: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 8,
  },
  thumbLoading: {
    paddingVertical: 18,
    alignItems: "center",
  },
  captureBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    margin: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: HT.navy,
  },
  captureBtnText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
