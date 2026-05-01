import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandLockup } from "@/components/ui/BrandHeader";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { Row, Section } from "@/components/ui/Section";
import { HT } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { confirmAction } from "@/lib/confirm";

export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const userRoles = user?.roles ?? [];
  const isSysAdmin = userRoles.includes("System Admin");

  const initials = (user?.fullName ?? "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  const confirmSignOut = () => {
    confirmAction({
      title: "Sign out?",
      message: "You'll need to sign back in to access your reports.",
      confirmLabel: "Sign out",
      destructive: true,
      onConfirm: async () => {
        setSigningOut(true);
        try {
          await signOut();
        } finally {
          setSigningOut(false);
        }
      },
    });
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 80,
      }}
    >
      <View style={styles.headerWrap}>
        <BrandLockup size={32} />
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user?.fullName ?? "—"}</Text>
        {user?.title ? <Text style={styles.title}>{user.title}</Text> : null}
        <View style={styles.roleBadgeRow}>
          {(userRoles.length > 0 ? userRoles : ["Employee"]).map((r) => (
            <View key={r} style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{r}</Text>
            </View>
          ))}
        </View>
      </View>

      <Section title="Account">
        <Row label="Email" value={user?.email ?? "—"} />
        <Row label="Department" value={user?.departmentName ?? "—"} />
        <Row label="Manager" value={user?.managerName ?? "—"} last />
      </Section>

      {isSysAdmin ? (
        <Section title="Admin">
          <Pressable
            style={styles.linkRow}
            onPress={() => router.push("/manager/delegations" as never)}
          >
            <Feather name="user-check" size={18} color={HT.navy} />
            <Text style={styles.linkText}>Approval delegation</Text>
            <Feather name="chevron-right" size={18} color={HT.ink4} />
          </Pressable>
        </Section>
      ) : null}

      <Section title="Help">
        <Pressable style={styles.linkRow} onPress={() => {}}>
          <Feather name="book-open" size={18} color={HT.navy} />
          <Text style={styles.linkText}>Submission policy</Text>
          <Feather name="chevron-right" size={18} color={HT.ink4} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.linkRow} onPress={() => {}}>
          <Feather name="message-circle" size={18} color={HT.navy} />
          <Text style={styles.linkText}>Contact accounting</Text>
          <Feather name="chevron-right" size={18} color={HT.ink4} />
        </Pressable>
      </Section>

      <View style={styles.signOut}>
        <PrimaryButton
          title="Sign out"
          variant="danger"
          icon="log-out"
          fullWidth
          loading={signingOut}
          onPress={confirmSignOut}
        />
      </View>

      <Text style={styles.footer}>Healthtrix Expense · iOS</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HT.canvas },
  headerWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  profileCard: {
    alignItems: "center",
    paddingTop: 18,
    paddingBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: HT.tintNavy,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: { fontFamily: "Inter_700Bold", color: HT.navy, fontSize: 28 },
  name: { fontFamily: "Inter_700Bold", fontSize: 22, color: HT.ink },
  title: { fontFamily: "Inter_500Medium", fontSize: 14, color: HT.ink3, marginTop: 2 },
  roleBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: HT.tintTeal,
  },
  roleBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: HT.teal },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  linkText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15, color: HT.ink },
  divider: {
    marginLeft: 46,
    height: StyleSheet.hairlineWidth,
    backgroundColor: HT.border,
  },
  signOut: { paddingHorizontal: 12, marginTop: 28 },
  footer: {
    textAlign: "center",
    color: HT.ink4,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginTop: 24,
  },
});
