import { Feather } from "@expo/vector-icons";
import {
  ApiError,
  getAdminListDelegationsQueryKey,
  type ManagerDelegation,
  useAdminCreateDelegation,
  useAdminListDelegations,
  useAdminRevokeDelegation,
  useListManagers,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/ui/EmptyState";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { Section } from "@/components/ui/Section";
import { HT } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { confirmAsync } from "@/lib/confirm";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function todayIso() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function isActive(d: ManagerDelegation): boolean {
  if (d.revokedAt) return false;
  const now = Date.now();
  const start = new Date(d.startsAt).getTime();
  const end = d.endsAt ? new Date(d.endsAt).getTime() : Number.POSITIVE_INFINITY;
  return now >= start && now <= end;
}

export default function ManagerDelegationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user: me } = useAuth();

  const delegationsQ = useAdminListDelegations(undefined, {
    query: { queryKey: getAdminListDelegationsQueryKey() },
  });
  const managersQ = useListManagers();
  const createMut = useAdminCreateDelegation();
  const revokeMut = useAdminRevokeDelegation();

  const [showAdd, setShowAdd] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<null | "from" | "to">(null);
  const [fromManagerId, setFromManagerId] = useState<string | null>(null);
  const [toManagerId, setToManagerId] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string>(todayIso());
  const [endsAt, setEndsAt] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  const isAdmin = me?.roles?.includes("System Admin") ?? false;

  const allDelegations = useMemo(() => delegationsQ.data ?? [], [delegationsQ.data]);

  const allManagers = useMemo(() => managersQ.data ?? [], [managersQ.data]);
  const toCandidates = useMemo(
    () => allManagers.filter((m) => m.id !== fromManagerId),
    [allManagers, fromManagerId],
  );

  const selectedFrom = allManagers.find((m) => m.id === fromManagerId) ?? null;
  const selectedTo = allManagers.find((m) => m.id === toManagerId) ?? null;

  const submit = () => {
    if (!fromManagerId) {
      setFormError("Pick the manager whose queue is being delegated.");
      return;
    }
    if (!toManagerId) {
      setFormError("Pick a manager to delegate to.");
      return;
    }
    if (!startsAt || !endsAt) {
      setFormError("Start and end dates are required.");
      return;
    }
    if (endsAt < startsAt) {
      setFormError("End date must be on or after start date.");
      return;
    }
    setFormError(null);
    createMut.mutate(
      {
        data: {
          fromManagerId,
          toManagerId,
          startsAt: new Date(startsAt + "T00:00:00").toISOString(),
          endsAt: new Date(endsAt + "T23:59:59").toISOString(),
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getAdminListDelegationsQueryKey() });
          setShowAdd(false);
          setFromManagerId(null);
          setToManagerId(null);
          setStartsAt(todayIso());
          setEndsAt("");
        },
        onError: (err) => {
          setFormError(
            err instanceof ApiError ? err.message : "Couldn't create delegation.",
          );
        },
      },
    );
  };

  const handleRevoke = async (d: ManagerDelegation) => {
    const ok = await confirmAsync({
      title: "Revoke delegation?",
      message: `Approvals will route back to ${d.fromManagerName}.`,
      confirmText: "Revoke",
      destructive: true,
    });
    if (!ok) return;
    revokeMut.mutate(
      { id: d.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getAdminListDelegationsQueryKey() });
        },
      },
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
          <Feather name="chevron-left" size={28} color={HT.ink} />
        </Pressable>
        <Text style={styles.title}>Delegation</Text>
        <Pressable
          onPress={() => {
            setShowAdd(true);
            setFormError(null);
          }}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <Feather name="plus" size={24} color={HT.navy} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        <Text style={styles.subtitle}>
          Route a manager's approval queue to another manager while they're away.
        </Text>

        {!isAdmin ? (
          <EmptyState
            icon="lock"
            title="Admin only"
            body="Only System Admins can manage approval delegations."
          />
        ) : null}

        <Section title="All delegations">
          {delegationsQ.isLoading ? (
            <View style={{ padding: 20, alignItems: "center" }}>
              <ActivityIndicator color={HT.navy} />
            </View>
          ) : allDelegations.length === 0 ? (
            <EmptyState
              icon="user-check"
              title="No delegations"
              body="Tap + above to delegate a manager's approval queue."
            />
          ) : (
            allDelegations.map((d, idx) => {
              const active = isActive(d);
              return (
                <View
                  key={d.id}
                  style={[styles.delegationRow, idx > 0 && styles.rowBorderTop]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={styles.delegationName}>{d.toManagerName}</Text>
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor: active
                              ? HT.tintTeal
                              : d.revokedAt
                                ? HT.tintTan
                                : HT.tintNavy,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            {
                              color: active
                                ? HT.teal
                                : d.revokedAt
                                  ? "#7A5512"
                                  : HT.navy,
                            },
                          ]}
                        >
                          {active ? "Active" : d.revokedAt ? "Revoked" : "Scheduled"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.delegationFrom}>
                      from {d.fromManagerName}
                    </Text>
                    <Text style={styles.delegationDates}>
                      {formatDate(d.startsAt)} → {formatDate(d.endsAt)}
                    </Text>
                    {d.revokedAt ? (
                      <Text style={styles.delegationRevoked}>
                        Revoked {formatDate(d.revokedAt)}
                      </Text>
                    ) : null}
                  </View>
                  {!d.revokedAt ? (
                    <Pressable
                      onPress={() => handleRevoke(d)}
                      hitSlop={10}
                      style={styles.trashBtn}
                      disabled={revokeMut.isPending}
                    >
                      <Feather name="trash-2" size={18} color={HT.danger} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}
        </Section>
      </ScrollView>

      {/* Add delegation modal */}
      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdd(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>New delegation</Text>

            <Text style={styles.fieldLabel}>Delegate from</Text>
            <Pressable onPress={() => setPickerOpen("from")} style={styles.pickerBtn}>
              <Text
                style={[
                  styles.pickerBtnText,
                  !selectedFrom && { color: HT.ink4 },
                ]}
              >
                {selectedFrom?.fullName ?? "Select manager"}
              </Text>
              <Feather name="chevron-down" size={18} color={HT.ink3} />
            </Pressable>

            <Text style={styles.fieldLabel}>Delegate to</Text>
            <Pressable onPress={() => setPickerOpen("to")} style={styles.pickerBtn}>
              <Text
                style={[
                  styles.pickerBtnText,
                  !selectedTo && { color: HT.ink4 },
                ]}
              >
                {selectedTo?.fullName ?? "Select manager"}
              </Text>
              <Feather name="chevron-down" size={18} color={HT.ink3} />
            </Pressable>

            <Text style={styles.fieldLabel}>Start date</Text>
            <TextInput
              value={startsAt}
              onChangeText={setStartsAt}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={HT.ink4}
              autoCapitalize="none"
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>End date</Text>
            <TextInput
              value={endsAt}
              onChangeText={setEndsAt}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={HT.ink4}
              autoCapitalize="none"
              style={styles.input}
            />

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Cancel"
                  variant="secondary"
                  fullWidth
                  onPress={() => setShowAdd(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title={createMut.isPending ? "Creating…" : "Create"}
                  icon="user-plus"
                  fullWidth
                  disabled={createMut.isPending}
                  onPress={submit}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manager picker */}
      <Modal
        visible={pickerOpen !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(null)}>
          <Pressable
            style={[styles.pickerSheet, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {pickerOpen === "from" ? "Delegate from" : "Delegate to"}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {(() => {
                const list = pickerOpen === "from" ? allManagers : toCandidates;
                const selectedId =
                  pickerOpen === "from" ? fromManagerId : toManagerId;
                if (list.length === 0) {
                  return (
                    <Text style={styles.emptyText}>
                      No managers available.
                    </Text>
                  );
                }
                return list.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => {
                      if (pickerOpen === "from") {
                        setFromManagerId(m.id);
                        if (toManagerId === m.id) setToManagerId(null);
                      } else {
                        setToManagerId(m.id);
                      }
                      setPickerOpen(null);
                    }}
                    style={({ pressed }) => [
                      styles.pickerRow,
                      selectedId === m.id && { backgroundColor: HT.tintNavy },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerRowName}>{m.fullName}</Text>
                      <Text style={styles.pickerRowSub}>{m.email}</Text>
                    </View>
                    {selectedId === m.id ? (
                      <Feather name="check" size={18} color={HT.navy} />
                    ) : null}
                  </Pressable>
                ));
              })()}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HT.canvas },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconBtn: { padding: 4 },
  title: { fontFamily: "Inter_700Bold", fontSize: 17, color: HT.ink },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: HT.ink3,
    lineHeight: 18,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  delegationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 10,
  },
  rowBorderTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HT.border,
  },
  delegationName: { fontFamily: "Inter_700Bold", fontSize: 15, color: HT.ink },
  delegationFrom: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: HT.ink3,
    marginTop: 4,
  },
  delegationDates: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: HT.ink2,
    marginTop: 4,
  },
  delegationRevoked: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: HT.ink4,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 10 },
  trashBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: HT.tintTan,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: HT.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  pickerSheet: {
    backgroundColor: HT.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: HT.border,
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: HT.ink,
    marginBottom: 16,
  },
  fieldLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: HT.ink3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 4,
  },
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: HT.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    backgroundColor: HT.canvas,
    marginBottom: 12,
  },
  pickerBtnText: { fontFamily: "Inter_500Medium", fontSize: 15, color: HT.ink },
  input: {
    borderWidth: 1,
    borderColor: HT.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: HT.ink,
    backgroundColor: HT.canvas,
    marginBottom: 12,
  },
  formError: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: HT.danger,
    marginTop: 4,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 10,
  },
  pickerRowName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: HT.ink },
  pickerRowSub: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: HT.ink3,
    marginTop: 2,
  },
  emptyText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: HT.ink3,
    textAlign: "center",
    paddingVertical: 24,
  },
});
