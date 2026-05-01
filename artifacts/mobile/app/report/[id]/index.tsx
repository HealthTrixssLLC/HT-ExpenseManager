import { Feather } from "@expo/vector-icons";
import {
  ApiError,
  type ExpenseReport,
  type LineItem,
  getGetReportQueryKey,
  getGetReportTimelineQueryKey,
  useDeleteLineItem,
  useDeleteReport,
  useGetReport,
  useGetReportTimeline,
  useUpdateReceipt,
  useManagerApprove,
  useManagerReject,
  useManagerRequestChanges,
  useRecallReport,
  useSubmitReport,
  useVoidReport,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/ui/EmptyState";
import { Money, formatUsd } from "@/components/ui/Money";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ReceiptThumb } from "@/components/ui/ReceiptThumb";
import { ReceiptViewer } from "@/components/ui/ReceiptViewer";
import { Section } from "@/components/ui/Section";
import { StatusPill } from "@/components/ui/StatusPill";
import { StatusTracker } from "@/components/ui/StatusTracker";
import { HT } from "@/constants/colors";
import { isEditable } from "@/constants/status";
import { useAuth } from "@/contexts/AuthContext";
import { confirmAction } from "@/lib/confirm";
import type { Receipt } from "@workspace/api-client-react";

function showError(title: string, message: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const reportQ = useGetReport(id, {
    query: {
      enabled: !!id,
      staleTime: 5_000,
      queryKey: getGetReportQueryKey(id),
    },
  });
  const timelineQ = useGetReportTimeline(id, {
    query: { enabled: !!id, queryKey: getGetReportTimelineQueryKey(id) },
  });

  const submit = useSubmitReport();
  const recall = useRecallReport();
  const voidReport = useVoidReport();
  const del = useDeleteReport();
  const approve = useManagerApprove();
  const reject = useManagerReject();
  const reqChanges = useManagerRequestChanges();
  const deleteLine = useDeleteLineItem();
  const updateReceipt = useUpdateReceipt();

  const [actionModal, setActionModal] = useState<
    null | "approve" | "reject" | "changes"
  >(null);
  const [actionComment, setActionComment] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewerReceipt, setViewerReceipt] = useState<Receipt | null>(null);

  if (!id) return null;

  if (reportQ.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={HT.navy} />
      </View>
    );
  }

  if (reportQ.isError || !reportQ.data) {
    return (
      <View style={styles.loading}>
        <EmptyState
          icon="alert-circle"
          title="Couldn't load this report"
          body={reportQ.error instanceof Error ? reportQ.error.message : "Try again."}
          action={
            <PrimaryButton title="Retry" onPress={() => reportQ.refetch()} />
          }
        />
      </View>
    );
  }

  const report = reportQ.data as ExpenseReport;
  const isOwner = report.employee.id === user?.id;
  const userRoles = user?.roles ?? [];
  const isManager = userRoles.includes("Manager Approver");
  const editable = isOwner && isEditable(report.status);
  const canSubmit = editable;
  const canRecall = isOwner && report.status === "Submitted";
  const canVoid =
    (isOwner && (report.status === "Draft" || report.status === "Changes Requested")) ||
    userRoles.includes("Accounting Admin") ||
    userRoles.includes("System Admin");
  const canDelete = isOwner && report.status === "Draft";
  const canManagerAct = isManager && report.status === "Manager Review";

  const totalCount = report.lineItems.length;

  const runAction = async (kind: "approve" | "reject" | "changes") => {
    setActionError(null);
    try {
      const data = { comment: actionComment.trim() || null };
      if (kind === "approve") {
        await approve.mutateAsync({ id, data });
      } else if (kind === "reject") {
        if (!actionComment.trim()) {
          setActionError("Please provide a reason for rejection.");
          return;
        }
        await reject.mutateAsync({ id, data });
      } else {
        if (!actionComment.trim()) {
          setActionError("Please describe what needs to change.");
          return;
        }
        await reqChanges.mutateAsync({ id, data });
      }
      Haptics.notificationAsync(
        kind === "reject"
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
      setActionModal(null);
      setActionComment("");
      reportQ.refetch();
      timelineQ.refetch();
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {},
      );
      setActionError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Action failed.",
      );
    }
  };

  const onSubmit = async () => {
    try {
      await submit.mutateAsync({ id });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      reportQ.refetch();
      timelineQ.refetch();
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {},
      );
      showError("Couldn't submit", err instanceof Error ? err.message : "Submission failed.");
    }
  };

  const onRecall = () => {
    confirmAction({
      title: "Recall this report?",
      message: "It will return to Draft.",
      confirmLabel: "Recall",
      destructive: true,
      onConfirm: async () => {
        try {
          await recall.mutateAsync({ id });
          reportQ.refetch();
          timelineQ.refetch();
        } catch (err) {
          showError("Couldn't recall", err instanceof Error ? err.message : "");
        }
      },
    });
  };

  const onVoid = () => {
    confirmAction({
      title: "Void this report?",
      message: "This moves the report to Voided. It cannot be undone.",
      confirmLabel: "Void",
      destructive: true,
      onConfirm: async () => {
        try {
          await voidReport.mutateAsync({ id, data: {} });
          reportQ.refetch();
        } catch (err) {
          showError("Couldn't void", err instanceof Error ? err.message : "");
        }
      },
    });
  };

  const onDelete = () => {
    confirmAction({
      title: "Delete this draft?",
      message: "This permanently deletes the draft and all of its line items.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        try {
          await del.mutateAsync({ id });
          router.back();
        } catch (err) {
          showError("Couldn't delete", err instanceof Error ? err.message : "");
        }
      },
    });
  };

  const removeLine = (line: LineItem) => {
    confirmAction({
      title: "Remove this line item?",
      message: `${line.merchant} · ${formatUsd(line.amount)}`,
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteLine.mutateAsync({ lineId: line.id });
          reportQ.refetch();
        } catch (err) {
          showError("Couldn't remove", err instanceof Error ? err.message : "");
        }
      },
    });
  };

  const unattachedReceipts = report.receipts.filter((r) => !r.lineItemId);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
          <Feather name="chevron-left" size={26} color={HT.ink} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{report.displayCode}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        refreshControl={
          <RefreshControl
            refreshing={reportQ.isRefetching}
            onRefresh={() => {
              reportQ.refetch();
              timelineQ.refetch();
            }}
            tintColor={HT.navy}
          />
        }
      >
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{report.title}</Text>
          {report.description ? (
            <Text style={styles.summaryDesc}>{report.description}</Text>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
            <StatusPill status={report.status} size="md" />
          </View>

          <View style={styles.totalRow}>
            <View>
              <Text style={styles.totalLabel}>Report total</Text>
              <Money value={report.total} size={28} weight="700" />
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.totalLabel}>Lines</Text>
              <Text style={styles.totalValue}>{totalCount}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.totalLabel}>Receipts</Text>
              <Text style={styles.totalValue}>{report.receipts.length}</Text>
            </View>
          </View>
        </View>

        <Section title="Status">
          <View style={{ padding: 16 }}>
            <StatusTracker current={report.status} />
          </View>
        </Section>

        <Section
          title="Line items"
          action={
            editable ? (
              <Pressable
                onPress={() => router.push(`/report/${id}/add-line`)}
                style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
                hitSlop={6}
              >
                <Feather name="plus" size={14} color={HT.navy} />
                <Text style={styles.addBtnText}>Add line</Text>
              </Pressable>
            ) : null
          }
        >
          {report.lineItems.length === 0 ? (
            <View style={{ padding: 20, alignItems: "center" }}>
              <Feather name="list" size={20} color={HT.ink4} />
              <Text style={styles.emptyText}>No line items yet</Text>
            </View>
          ) : (
            report.lineItems.map((line, i) => (
              <View
                key={line.id}
                style={[
                  styles.lineRow,
                  i < report.lineItems.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: HT.border,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineMerchant}>{line.merchant}</Text>
                  <Text style={styles.lineMeta}>
                    {line.category} · {line.paymentMethod} · {line.occurredOn}
                  </Text>
                  {line.description ? (
                    <Text style={styles.lineDesc} numberOfLines={2}>{line.description}</Text>
                  ) : null}
                  <View style={styles.lineFlags}>
                    {line.receiptCount === 0 ? (
                      <View style={styles.flagBadge}>
                        <Feather name="paperclip" size={11} color={HT.warning} />
                        <Text style={styles.flagText}>missing receipt</Text>
                      </View>
                    ) : (
                      <View style={[styles.flagBadge, { backgroundColor: HT.tintGreen }]}>
                        <Feather name="check" size={11} color="#34604F" />
                        <Text style={[styles.flagText, { color: "#34604F" }]}>
                          {line.receiptCount} receipt{line.receiptCount === 1 ? "" : "s"}
                        </Text>
                      </View>
                    )}
                    {line.needsReview ? (
                      <View style={[styles.flagBadge, { backgroundColor: HT.tintOrange }]}>
                        <Feather name="alert-triangle" size={11} color={HT.warning} />
                        <Text style={[styles.flagText, { color: HT.warning }]}>policy review</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <Money value={line.amount} size={16} weight="700" />
                  {editable ? (
                    <Pressable
                      onPress={() => removeLine(line)}
                      hitSlop={8}
                      style={({ pressed }) => [{ opacity: pressed ? 0.4 : 0.7 }]}
                    >
                      <Feather name="trash-2" size={16} color={HT.danger} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </Section>

        {report.receipts.length > 0 ? (
          <Section title={`Receipts (${report.receipts.length})`}>
            <View style={styles.thumbGrid}>
              {report.receipts.map((r) => (
                <View key={r.id} style={{ alignItems: "center" }}>
                  <ReceiptThumb
                    receipt={r}
                    size={84}
                    onPress={() => setViewerReceipt(r)}
                  />
                  {r.lineItemId ? (
                    <Text style={styles.thumbBadge} numberOfLines={1}>
                      Attached
                    </Text>
                  ) : (
                    <Text style={[styles.thumbBadge, { color: HT.warning }]} numberOfLines={1}>
                      Unattached
                    </Text>
                  )}
                </View>
              ))}
            </View>
            {unattachedReceipts.length > 0 && editable ? (
              <Text style={styles.unattachedHint}>
                Tap a receipt to view it. To attach an unattached receipt, open
                the line item from "Line items" above.
              </Text>
            ) : null}
          </Section>
        ) : null}

        <Section title="Activity">
          {timelineQ.isLoading ? (
            <View style={{ padding: 16, alignItems: "center" }}>
              <ActivityIndicator color={HT.navy} />
            </View>
          ) : (timelineQ.data ?? []).length === 0 ? (
            <View style={{ padding: 16, alignItems: "center" }}>
              <Text style={styles.emptyText}>No activity yet</Text>
            </View>
          ) : (
            (timelineQ.data ?? []).map((a, i, arr) => (
              <View
                key={a.id}
                style={[
                  styles.activityRow,
                  i < arr.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: HT.border,
                  },
                ]}
              >
                <View style={styles.activityDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityWho}>{a.actor.fullName}</Text>
                  <Text style={styles.activityWhat}>
                    {a.fromStatus} → <Text style={{ color: HT.ink }}>{a.toStatus}</Text>
                  </Text>
                  {a.comment ? (
                    <Text style={styles.activityComment}>"{a.comment}"</Text>
                  ) : null}
                  <Text style={styles.activityWhen}>
                    {new Date(a.createdAt).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Section>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
        {canSubmit ? (
          <PrimaryButton
            title="Submit for review"
            icon="send"
            fullWidth
            size="lg"
            loading={submit.isPending}
            onPress={onSubmit}
          />
        ) : null}
        {canManagerAct ? (
          <View style={{ gap: 10 }}>
            <PrimaryButton
              title="Approve"
              icon="check"
              fullWidth
              size="lg"
              variant="accent"
              loading={approve.isPending}
              onPress={() => {
                setActionComment("");
                setActionError(null);
                setActionModal("approve");
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Request changes"
                  icon="message-square"
                  variant="secondary"
                  fullWidth
                  onPress={() => {
                    setActionComment("");
                    setActionError(null);
                    setActionModal("changes");
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Reject"
                  icon="x-circle"
                  variant="danger"
                  fullWidth
                  onPress={() => {
                    setActionComment("");
                    setActionError(null);
                    setActionModal("reject");
                  }}
                />
              </View>
            </View>
          </View>
        ) : null}
        {!canSubmit && !canManagerAct ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            {canRecall ? (
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Recall"
                  icon="rotate-ccw"
                  variant="secondary"
                  fullWidth
                  loading={recall.isPending}
                  onPress={onRecall}
                />
              </View>
            ) : null}
            {canDelete ? (
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Delete draft"
                  icon="trash-2"
                  variant="danger"
                  fullWidth
                  loading={del.isPending}
                  onPress={onDelete}
                />
              </View>
            ) : canVoid ? (
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Void"
                  icon="slash"
                  variant="danger"
                  fullWidth
                  loading={voidReport.isPending}
                  onPress={onVoid}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <Modal
        visible={actionModal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setActionModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>
              {actionModal === "approve"
                ? "Approve report?"
                : actionModal === "changes"
                  ? "Request changes"
                  : "Reject report?"}
            </Text>
            <Text style={styles.modalSub}>
              {actionModal === "approve"
                ? "Optional note for the employee and finance team."
                : actionModal === "changes"
                  ? "Tell the employee what to fix. They'll be able to edit and resubmit."
                  : "Provide a reason. This is a terminal status."}
            </Text>
            <TextInput
              value={actionComment}
              onChangeText={setActionComment}
              placeholder="Write a note..."
              placeholderTextColor={HT.ink4}
              multiline
              style={styles.modalInput}
              autoFocus
            />
            {actionError ? <Text style={styles.modalError}>{actionError}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Cancel"
                  variant="secondary"
                  fullWidth
                  onPress={() => setActionModal(null)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title={
                    actionModal === "approve"
                      ? "Approve"
                      : actionModal === "changes"
                        ? "Send back"
                        : "Reject"
                  }
                  variant={actionModal === "reject" ? "danger" : actionModal === "approve" ? "accent" : "primary"}
                  fullWidth
                  loading={approve.isPending || reject.isPending || reqChanges.isPending}
                  onPress={() => {
                    if (actionModal) runAction(actionModal);
                  }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <ReceiptViewer
        receipt={viewerReceipt}
        visible={viewerReceipt !== null}
        onClose={() => setViewerReceipt(null)}
        lines={editable ? report.lineItems : undefined}
        canEdit={editable}
        isMutating={updateReceipt.isPending}
        onAttach={async (rcpt, lineId) => {
          try {
            const updated = await updateReceipt.mutateAsync({
              id: rcpt.id,
              data: { lineItemId: lineId },
            });
            setViewerReceipt(updated);
            reportQ.refetch();
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
            setViewerReceipt(updated);
            reportQ.refetch();
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HT.canvas },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: HT.canvas },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  iconBtn: { padding: 4 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: HT.ink },
  summaryCard: {
    backgroundColor: HT.surface,
    marginHorizontal: 12,
    borderRadius: 16,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HT.border,
  },
  summaryTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: HT.ink, lineHeight: 26 },
  summaryDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: HT.ink3,
    marginTop: 4,
    lineHeight: 20,
  },
  totalRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
  },
  totalLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: HT.ink3,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  totalValue: { fontFamily: "Inter_700Bold", fontSize: 22, color: HT.ink },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  addBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: HT.navy },
  lineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  lineMerchant: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: HT.ink },
  lineMeta: { fontFamily: "Inter_500Medium", fontSize: 12, color: HT.ink3, marginTop: 2 },
  lineDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: HT.ink2, marginTop: 4 },
  lineFlags: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  flagBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: HT.tintOrange,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  flagText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: HT.warning },
  emptyText: { fontFamily: "Inter_500Medium", fontSize: 13, color: HT.ink3, marginTop: 8 },
  thumbGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 14 },
  thumbBadge: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: HT.ink3,
    marginTop: 4,
    textAlign: "center",
    maxWidth: 84,
  },
  unattachedHint: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: HT.ink3,
    lineHeight: 16,
  },
  activityRow: { flexDirection: "row", padding: 14, gap: 10 },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: HT.teal,
    marginTop: 6,
  },
  activityWho: { fontFamily: "Inter_700Bold", fontSize: 13, color: HT.ink },
  activityWhat: { fontFamily: "Inter_500Medium", fontSize: 12, color: HT.ink3, marginTop: 2 },
  activityComment: {
    marginTop: 4,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: HT.ink2,
    fontStyle: "italic",
  },
  activityWhen: { fontFamily: "Inter_500Medium", fontSize: 11, color: HT.ink4, marginTop: 4 },
  actions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: HT.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HT.border,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(14,26,43,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: HT.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: HT.ink },
  modalSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: HT.ink3, marginTop: 6 },
  modalInput: {
    marginTop: 14,
    minHeight: 100,
    borderWidth: 1,
    borderColor: HT.border,
    borderRadius: 12,
    padding: 12,
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: HT.ink,
    textAlignVertical: "top",
    backgroundColor: HT.surfaceAlt,
  },
  modalError: { color: HT.danger, fontFamily: "Inter_500Medium", marginTop: 8 },
});
