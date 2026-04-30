import { Feather } from "@expo/vector-icons";
import {
  ApiError,
  useCreateReport,
  useListDepartments,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
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
import { useAuth } from "@/contexts/AuthContext";

export default function NewReportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState<string | null>(
    user?.departmentId ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  const departments = useListDepartments();
  const createMutation = useCreateReport();

  const submit = async () => {
    setError(null);
    if (!title.trim()) {
      setError("Give the report a short title.");
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          departmentId,
        },
      });
      router.replace(`/report/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not create report.",
      );
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconBtn}>
          <Feather name="x" size={22} color={HT.ink2} />
        </Pressable>
        <Text style={styles.headerTitle}>New report</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Boston conference - Apr 2026"
          placeholderTextColor={HT.ink4}
          style={styles.input}
          autoFocus
        />

        <Text style={[styles.label, { marginTop: 18 }]}>Description (optional)</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Trip details, project, etc."
          placeholderTextColor={HT.ink4}
          style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
          multiline
        />

        <Text style={[styles.label, { marginTop: 18 }]}>Department</Text>
        <View style={styles.deptList}>
          {departments.data?.map((d) => {
            const sel = departmentId === d.id;
            return (
              <Pressable
                key={d.id}
                onPress={() => setDepartmentId(d.id)}
                style={({ pressed }) => [
                  styles.deptChip,
                  sel && { borderColor: HT.navy, backgroundColor: HT.tintNavy },
                  pressed && !sel && { backgroundColor: HT.surfaceAlt },
                ]}
              >
                <Text style={[styles.deptText, sel && { color: HT.navy }]}>
                  {d.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton
          title="Create draft"
          icon="check"
          fullWidth
          size="lg"
          loading={createMutation.isPending}
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
  deptList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  deptChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HT.borderStrong,
    backgroundColor: HT.surface,
  },
  deptText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: HT.ink2 },
  error: {
    color: HT.danger,
    fontFamily: "Inter_500Medium",
    marginTop: 16,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: HT.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HT.border,
  },
});
