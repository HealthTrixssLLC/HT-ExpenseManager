import { Feather } from "@expo/vector-icons";
import {
  ApiError,
  type CategoryOption,
  PaymentMethod,
  useCreateLineItem,
  useListCategories,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
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

import { HelpLink } from "@/components/help/HelpLink";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { HT } from "@/constants/colors";

const PAYMENT_METHODS: PaymentMethod[] = [
  PaymentMethod.Personal_Card,
  PaymentMethod.Cash,
  PaymentMethod.Company_Card,
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AddLineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [category, setCategory] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PaymentMethod.Personal_Card,
  );
  const [attachReceipt, setAttachReceipt] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const categoriesQ = useListCategories();
  const create = useCreateLineItem();

  const validAmount = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) && n > 0;
  }, [amount]);

  const submit = async () => {
    setError(null);
    if (!merchant.trim()) return setError("Enter the merchant name.");
    if (!validAmount) return setError("Enter a valid amount.");
    if (!category) return setError("Pick a category.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn))
      return setError("Date must be YYYY-MM-DD.");

    try {
      const created = await create.mutateAsync({
        id,
        data: {
          merchant: merchant.trim(),
          amount: Number(amount).toFixed(2),
          description: description.trim() || undefined,
          occurredOn,
          category,
          paymentMethod,
        },
      });
      if (attachReceipt && created?.id) {
        router.replace({
          pathname: "/report/[id]/capture",
          params: { id, lineId: created.id },
        });
      } else {
        router.back();
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not add line.",
      );
    }
  };

  const categories = (categoriesQ.data ?? []).filter((c: CategoryOption) => c.active);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
          <Feather name="x" size={22} color={HT.ink2} />
        </Pressable>
        <Text style={styles.headerTitle}>Add line item</Text>
        <HelpLink topicId="add-line-items" />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Merchant</Text>
        <TextInput
          value={merchant}
          onChangeText={setMerchant}
          placeholder="e.g. Sheraton Boston"
          placeholderTextColor={HT.ink4}
          style={styles.input}
          autoFocus
        />

        <View style={{ flexDirection: "row", gap: 12, marginTop: 18 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Amount</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={HT.ink4}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Date</Text>
            <TextInput
              value={occurredOn}
              onChangeText={setOccurredOn}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={HT.ink4}
              style={styles.input}
              autoCapitalize="none"
            />
          </View>
        </View>

        <Text style={[styles.label, { marginTop: 18 }]}>Category</Text>
        <View style={styles.chipGrid}>
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

        <Text style={[styles.label, { marginTop: 18 }]}>Payment method</Text>
        <View style={styles.chipGrid}>
          {PAYMENT_METHODS.map((pm) => {
            const sel = paymentMethod === pm;
            return (
              <Pressable
                key={pm}
                onPress={() => setPaymentMethod(pm)}
                style={({ pressed }) => [
                  styles.chip,
                  sel && { backgroundColor: HT.tintNavy, borderColor: HT.navy },
                  pressed && !sel && { backgroundColor: HT.surfaceAlt },
                ]}
              >
                <Text style={[styles.chipText, sel && { color: HT.navy }]}>{pm}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => setAttachReceipt((v) => !v)}
          style={({ pressed }) => [
            styles.toggleRow,
            pressed && { backgroundColor: HT.surfaceAlt },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Attach a receipt next</Text>
            <Text style={styles.toggleSub}>
              Open the camera after saving so you can capture or pick a receipt for this line.
            </Text>
          </View>
          <View
            style={[
              styles.toggleBox,
              attachReceipt && {
                backgroundColor: HT.navy,
                borderColor: HT.navy,
              },
            ]}
          >
            {attachReceipt ? (
              <Feather name="check" size={14} color="#FFFFFF" />
            ) : null}
          </View>
        </Pressable>

        <Text style={[styles.label, { marginTop: 18 }]}>Notes (optional)</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Attendees, project, etc."
          placeholderTextColor={HT.ink4}
          style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton
          title={attachReceipt ? "Save & add receipt" : "Add line item"}
          icon={attachReceipt ? "camera" : "plus"}
          fullWidth
          size="lg"
          loading={create.isPending}
          onPress={submit}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HT.canvas },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconBtn: { padding: 6 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: HT.ink },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: HT.ink3,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    backgroundColor: HT.surface,
    borderWidth: 1,
    borderColor: HT.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: HT.ink,
  },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HT.borderStrong,
    backgroundColor: HT.surface,
  },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: HT.ink2 },
  toggleRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: HT.surface,
    borderWidth: 1,
    borderColor: HT.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  toggleTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: HT.ink,
  },
  toggleSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: HT.ink3,
    marginTop: 2,
  },
  toggleBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: HT.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: HT.surface,
  },
  error: { color: HT.danger, fontFamily: "Inter_500Medium", marginTop: 16 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: HT.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HT.border,
  },
});
