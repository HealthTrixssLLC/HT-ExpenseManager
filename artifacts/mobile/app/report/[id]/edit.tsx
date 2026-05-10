import { Feather } from "@expo/vector-icons";
import {
  ApiError,
  getGetReportQueryKey,
  getGetReportTimelineQueryKey,
  getListLineItemsQueryKey,
  getListReceiptsQueryKey,
  getListReportsQueryKey,
  useGetReport,
  useUpdateReport,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { HT } from "@/constants/colors";
import { isEditable } from "@/constants/status";
import { useAuth } from "@/contexts/AuthContext";

export default function EditReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const reportQ = useGetReport(id, {
    query: { enabled: !!id, queryKey: getGetReportQueryKey(id) },
  });
  const update = useUpdateReport();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (reportQ.data && !hydrated) {
      setTitle(reportQ.data.title);
      setDescription(reportQ.data.description ?? "");
      setPeriodStart(reportQ.data.periodStart ?? "");
      setPeriodEnd(reportQ.data.periodEnd ?? "");
      setHydrated(true);
    }
  }, [reportQ.data, hydrated]);

  if (reportQ.isLoading || !reportQ.data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={HT.navy} />
      </View>
    );
  }

  const report = reportQ.data;
  const isOwner = report.employee.id === user?.id;
  if (!isOwner || !isEditable(report.status)) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
            <Feather name="chevron-left" size={26} color={HT.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Edit report</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={{ padding: 24 }}>
          <Text style={styles.lockedText}>
            This report can no longer be edited.
          </Text>
        </View>
      </View>
    );
  }

  const onSave = async () => {
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (periodStart && periodEnd && periodStart > periodEnd) {
      setError("Period end must be on or after the start.");
      return;
    }
    if (periodStart && !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
      setError("Period start must be YYYY-MM-DD.");
      return;
    }
    if (periodEnd && !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
      setError("Period end must be YYYY-MM-DD.");
      return;
    }
    try {
      await update.mutateAsync({
        id,
        data: {
          title: title.trim(),
          description: description.trim(),
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
        },
      });
      qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
      qc.invalidateQueries({ queryKey: getGetReportTimelineQueryKey(id) });
      qc.invalidateQueries({ queryKey: getListLineItemsQueryKey(id) });
      qc.invalidateQueries({ queryKey: getListReceiptsQueryKey(id) });
      qc.invalidateQueries({ queryKey: getListReportsQueryKey() });
      router.back();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not save changes.",
      );
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
          <Feather name="chevron-left" size={26} color={HT.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit report</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}>
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Report title"
          placeholderTextColor={HT.ink4}
          testID="input-edit-report-title"
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
          value={description}
          onChangeText={setDescription}
          placeholder="What is this report for?"
          placeholderTextColor={HT.ink4}
          multiline
        />

        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Period start</Text>
            <TextInput
              style={styles.input}
              value={periodStart}
              onChangeText={setPeriodStart}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={HT.ink4}
              autoCapitalize="none"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Period end</Text>
            <TextInput
              style={styles.input}
              value={periodEnd}
              onChangeText={setPeriodEnd}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={HT.ink4}
              autoCapitalize="none"
            />
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton
          title="Save changes"
          icon="check"
          fullWidth
          size="lg"
          loading={update.isPending}
          onPress={onSave}
        />
      </View>
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
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: HT.ink3,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: HT.border,
    borderRadius: 12,
    padding: 12,
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: HT.ink,
    backgroundColor: HT.surface,
  },
  error: {
    marginTop: 14,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: HT.danger,
  },
  lockedText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: HT.ink2,
  },
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
});
