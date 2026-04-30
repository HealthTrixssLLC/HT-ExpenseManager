import { Feather } from "@expo/vector-icons";
import {
  ApiError,
  getGetBootstrapStatusQueryKey,
  useGetBootstrapStatus,
} from "@workspace/api-client-react";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandLockup } from "@/components/ui/BrandHeader";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { HT } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

const DEMO_USERS: { label: string; email: string }[] = [
  { label: "Employee · Priya", email: "priya@healthtrix.test" },
  { label: "Employee · Marcus", email: "marcus@healthtrix.test" },
  { label: "Manager · Rosa", email: "manager@healthtrix.test" },
  { label: "Finance · Lila", email: "finance@healthtrix.test" },
];
const DEMO_PASSWORD = "Healthtrix!2026";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("priya@healthtrix.test");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  const bootstrapQ = useGetBootstrapStatus({
    query: {
      staleTime: 30_000,
      retry: 1,
      queryKey: getGetBootstrapStatusQueryKey(),
    },
  });
  const needsBootstrap = bootstrapQ.data?.bootstrapped === false;

  const submit = async () => {
    Keyboard.dismiss();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Email or password is incorrect.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts. Please wait a moment and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const useDemo = (e: string) => {
    setEmail(e);
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[HT.navyDeep, HT.navy, HT.teal]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 28 }]}
      >
        <View style={styles.heroLockup}>
          <BrandLockup size={36} />
        </View>
        <Text style={styles.heroTitle}>Submit expenses{"\n"}from anywhere.</Text>
        <Text style={styles.heroBody}>
          Snap receipts, draft reports, and respond to manager feedback in seconds.
        </Text>
      </LinearGradient>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Sign in</Text>

        {needsBootstrap ? (
          <View style={styles.bootstrapBanner}>
            <View style={styles.bootstrapIconWrap}>
              <Feather name="shield" size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bootstrapTitle}>Set up your organization</Text>
              <Text style={styles.bootstrapBody}>
                No System Admin exists yet. Use the Healthtrix web app to
                bootstrap the first admin, then sign in here.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Work email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@healthtrix.test"
            placeholderTextColor={HT.ink4}
            style={styles.input}
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              secureTextEntry={!showPwd}
              textContentType="password"
              placeholder="••••••••"
              placeholderTextColor={HT.ink4}
              style={[styles.input, { flex: 1, borderWidth: 0, paddingHorizontal: 0 }]}
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            <Pressable
              onPress={() => setShowPwd((v) => !v)}
              style={styles.eyeBtn}
              hitSlop={8}
            >
              <Text style={styles.eyeText}>{showPwd ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={{ marginTop: 16 }}>
          <PrimaryButton
            title="Sign in"
            onPress={submit}
            loading={submitting}
            fullWidth
            size="lg"
          />
        </View>

        <Text style={styles.demoHeading}>Demo accounts</Text>
        <Text style={styles.demoBody}>
          Tap to fill. All demo accounts share the password{" "}
          <Text style={{ fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) }}>
            Healthtrix!2026
          </Text>
          .
        </Text>
        <View style={styles.demoGrid}>
          {DEMO_USERS.map((u) => (
            <Pressable
              key={u.email}
              onPress={() => useDemo(u.email)}
              style={({ pressed }) => [
                styles.demoChip,
                pressed && { backgroundColor: HT.surfaceAlt },
              ]}
            >
              <Text style={styles.demoChipText}>{u.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HT.navy },
  hero: { paddingHorizontal: 24, paddingBottom: 36 },
  heroLockup: {
    backgroundColor: "rgba(255,255,255,0.96)",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 24,
  },
  heroTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    lineHeight: 34,
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  heroBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(255,255,255,0.78)",
    marginTop: 12,
    maxWidth: 360,
  },
  sheet: {
    flex: 1,
    backgroundColor: HT.canvas,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -16,
  },
  sheetContent: { paddingTop: 24, paddingHorizontal: 20 },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: HT.ink,
    marginBottom: 18,
  },
  field: { marginBottom: 14 },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: HT.ink3,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: HT.ink,
    backgroundColor: HT.surface,
    borderWidth: 1,
    borderColor: HT.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: HT.surface,
    borderWidth: 1,
    borderColor: HT.border,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  eyeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  eyeText: { color: HT.navy, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  error: {
    color: HT.danger,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    marginTop: 8,
  },
  demoHeading: {
    marginTop: 32,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: HT.ink3,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  demoBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: HT.ink3,
    marginTop: 6,
    lineHeight: 18,
  },
  demoGrid: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  demoChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: HT.surface,
    borderWidth: 1,
    borderColor: HT.border,
  },
  demoChipText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: HT.navy },
  bootstrapBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: HT.tintNavy,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: HT.navy,
  },
  bootstrapIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: HT.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  bootstrapTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: HT.navy,
  },
  bootstrapBody: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: HT.ink2,
    marginTop: 4,
    lineHeight: 16,
  },
});
