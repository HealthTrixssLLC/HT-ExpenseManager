import { Feather } from "@expo/vector-icons";
import {
  ApiError,
  type CategoryOption,
  type LineItem,
  PaymentMethod,
  getGetReportQueryKey,
  getGetReportTimelineQueryKey,
  getListLineItemsQueryKey,
  useGetReport,
  useListCategories,
  useUpdateLineItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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

const PAYMENT_METHODS: PaymentMethod[] = [
  PaymentMethod.Personal_Card,
  PaymentMethod.Cash,
  PaymentMethod.Company_Card,
];

export default function EditLineScreen() {
  const { id, lineId } = useLocalSearchParams<{ id: string; lineId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const reportQ = useGetReport(id, {
    query: { enabled: !!id, queryKey: getGetReportQueryKey(id) },
  });
  const categoriesQ = useListCategories();
  const update = useUpdateLineItem();

  const line: LineItem | undefined = useMemo(
    () => reportQ.data?.lineItems.find((l) => l.id === lineId),
    [reportQ.data, lineId],
  );

  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [category, setCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PaymentMethod.Personal_Card,
  );
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (line && !hydrated) {
      setMerchant(line.merchant);
      setAmount(String(line.amount));
      setDescription(line.description ?? "");
      setOccurredOn(line.occurredOn);
      setCategory(line.category ?? "");
      setPaymentMethod(line.paymentMethod);
      setHydrated(true);
    }
  }, [line, hydrated]);

  if (reportQ.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={HT.navy} />
      </View>
    );
  }

  if (!reportQ.data || !line) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
            <Feather name="chevron-left" size={26} color={HT.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Edit line item</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={{ padding: 24 }}>
          <Text style={styles.lockedText}>Line item not found.</Text>
        </View>
      </View>
    );
  }

  const isOwner = reportQ.data.employee.id === user?.id;
  if (!isOwner || !isEditable(reportQ.data.status)) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
            <Feather name="chevron-left" size={26} color={HT.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Edit line item</Text>
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
    if (!merchant.trim()) return setError("Enter the merchant name.");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Enter a valid amount.");
    if (!category) return setError("Pick a category.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn))
      return setError("Date must be YYYY-MM-DD.");

    try {
      await update.mutateAsync({
        lineId: line.id,
        data: {
          merchant: merchant.trim(),
          amount: amt.toFixed(2),
          description: description.trim(),
          occurredOn,
          category,
          paymentMethod,
        },
      });
      qc.invalidateQueries({ queryKey: getListLineItemsQueryKey(id) });
      qc.invalidateQueries({ queryKey: getGetReportQueryKey(id) });
      qc.invalidateQueries({ queryKey: getGetReportTimelineQueryKey(id) });
      router.back();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not save line item.",
      );
    }
  };

  const categories = (categoriesQ.data ?? []).filter((c: CategoryOption) => c.active);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
          <Feather name="chevron-left" size={26} color={HT.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit line item</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}>
        <Text style={styles.label}>Merchant</Text>
        <TextInput
          style={styles.input}
          value={merchant}
          onChangeText={setMerchant}
          placeholder="Where you spent it"
          placeholderTextColor={HT.ink4}
          testID="input-edit-line-merchant"
        />

        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Amount</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={HT.ink4}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Date</Text>
            <TextInput
              style={styles.input}
              value={occurredOn}
              onChangeText={setOccurredOn}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={HT.ink4}
              autoCapitalize="none"
            />
          </View>
        </View>

        <Text style={styles.label}>Category</Text>
        <View style={styles.chipRow}>
          {categories.map((c) => {
            const sel = category === c.code;
            return (
              <Pressable
                key={c.code}
                onPress={() => setCategory(c.code)}
                style={({ pressed }) => [
                  styles.chip,
                  sel && { backgroundColor: HT.tintNavy, borderColor: HT.navy },
                  pressed && !sel && { backgroundColor: HT.surfaceAlt },
                ]}
              >
                <Text style={[styles.chipText, sel && { color: HT.navy }]}>
                  {c.code}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Payment method</Text>
        <View style={styles.chipRow}>
          {PAYMENT_METHODS.map((p) => {
            const sel = paymentMethod === p;
            return (
              <Pressable
                key={p}
                onPress={() => setPaymentMethod(p)}
                style={({ pressed }) => [
                  styles.chip,
                  sel && { backgroundColor: HT.tintNavy, borderColor: HT.navy },
                  pressed && !sel && { backgroundColor: HT.surfaceAlt },
                ]}
              >
                <Text style={[styles.chipText, sel && { color: HT.navy }]}>
                  {p.replace(/_/g, " ")}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Business purpose, attendees, etc."
          placeholderTextColor={HT.ink4}
          multiline
        />

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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HT.borderStrong,
    backgroundColor: HT.surface,
  },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: HT.ink2 },
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
