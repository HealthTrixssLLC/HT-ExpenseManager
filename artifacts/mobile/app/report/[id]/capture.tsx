import { Feather } from "@expo/vector-icons";
import {
  ApiError,
  type LineItem,
  useGetReport,
  useRegisterReceipt,
  useRequestUploadUrl,
} from "@workspace/api-client-react";
import {
  CameraView,
  useCameraPermissions,
  type CameraType,
} from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Money } from "@/components/ui/Money";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { HT } from "@/constants/colors";

type Stage = "permission" | "shoot" | "review" | "select-line" | "uploading" | "done";

type Captured = {
  uri: string;
  width: number;
  height: number;
};

export default function CaptureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cameraRef = useRef<CameraView | null>(null);

  const reportQ = useGetReport(id, { query: { enabled: !!id } });
  const uploadUrlMutation = useRequestUploadUrl();
  const registerMutation = useRegisterReceipt();

  const [permission, requestPermission] = useCameraPermissions();
  const [facing] = useState<CameraType>("back");
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [stage, setStage] = useState<Stage>("shoot");
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleClose = () => router.back();

  if (!id) return null;

  // Web fallback: skip camera, only library picker.
  const isWeb = Platform.OS === "web";

  const ensurePermission = async () => {
    if (isWeb) return true;
    if (permission?.granted) return true;
    const res = await requestPermission();
    return res.granted;
  };

  const takePicture = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });
      if (!photo) return;
      setCaptured({ uri: photo.uri, width: photo.width ?? 0, height: photo.height ?? 0 });
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to capture photo.");
    } finally {
      setIsCapturing(false);
    }
  };

  const pickFromLibrary = async () => {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert("Permission required\n\nAllow Photos access to pick a receipt.");
      } else {
        Alert.alert("Permission required", "Allow Photos access to pick a receipt.");
      }
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setCaptured({ uri: a.uri, width: a.width, height: a.height });
    setStage("review");
  };

  const proceedToLineSelect = () => setStage("select-line");

  const upload = async (lineItemId: string | null) => {
    if (!captured) return;
    setStage("uploading");
    setError(null);
    try {
      // 1. Convert URI -> blob (works in RN/Expo and on web)
      setProgress("Preparing receipt...");
      const fileResp = await fetch(captured.uri);
      const blob = await fileResp.blob();
      const mime = blob.type || "image/jpeg";
      if (blob.size > 10 * 1024 * 1024) {
        throw new Error("Receipt is larger than the 10 MB limit.");
      }
      const ext =
        mime === "image/png"
          ? "png"
          : mime === "image/heic"
            ? "heic"
            : mime === "application/pdf"
              ? "pdf"
              : "jpg";
      const filename = `receipt-${Date.now()}.${ext}`;

      // 2. Get a signed PUT URL
      setProgress("Requesting upload URL...");
      const upload = await uploadUrlMutation.mutateAsync({
        data: {
          reportId: id,
          name: filename,
          size: blob.size,
          contentType: mime,
        },
      });

      // 3. PUT the binary
      setProgress("Uploading...");
      const putResp = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": mime },
        body: blob,
      });
      if (!putResp.ok) {
        throw new Error(`Upload failed (${putResp.status}).`);
      }

      // 4. Register the receipt against the report (and optional line)
      setProgress("Saving...");
      await registerMutation.mutateAsync({
        id,
        data: {
          objectPath: upload.objectPath,
          filename,
          mimeType: mime,
          sizeBytes: blob.size,
          lineItemId,
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      setStage("done");
      setTimeout(() => router.back(), 600);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Upload failed.",
      );
      setStage("review");
    }
  };

  // ---------------- RENDER ----------------

  if (!isWeb && permission && !permission.granted) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top + 24 }]}>
        <View style={styles.iconBubble}>
          <Feather name="camera" size={28} color={HT.navy} />
        </View>
        <Text style={styles.h1}>Camera permission</Text>
        <Text style={styles.body}>
          We use the camera to capture receipts and attach them to your report.
        </Text>
        <View style={{ marginTop: 20, gap: 10, width: 260 }}>
          <PrimaryButton
            title="Allow camera access"
            icon="check"
            fullWidth
            onPress={ensurePermission}
          />
          <PrimaryButton
            title="Pick from library instead"
            icon="image"
            variant="secondary"
            fullWidth
            onPress={pickFromLibrary}
          />
          <PrimaryButton
            title="Cancel"
            variant="ghost"
            fullWidth
            onPress={handleClose}
          />
        </View>
      </View>
    );
  }

  if (stage === "shoot") {
    return (
      <View style={styles.cameraRoot}>
        {!isWeb ? (
          <CameraView
            ref={(r) => {
              cameraRef.current = r;
            }}
            style={StyleSheet.absoluteFill}
            facing={facing}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: HT.navyDeep, alignItems: "center", justifyContent: "center" }]}>
            <Feather name="camera-off" size={36} color="#FFFFFF80" />
            <Text style={{ color: "#FFFFFF", fontFamily: "Inter_500Medium", marginTop: 8 }}>
              Camera capture is mobile-only
            </Text>
          </View>
        )}

        <View style={[styles.cameraTop, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={handleClose} style={styles.cameraBtn} hitSlop={8}>
            <Feather name="x" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.cameraTitle}>Capture receipt</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + 24 }]}>
          <Pressable onPress={pickFromLibrary} hitSlop={8} style={styles.libBtn}>
            <Feather name="image" size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={takePicture}
            style={({ pressed }) => [
              styles.shutter,
              pressed && { transform: [{ scale: 0.94 }] },
              isWeb && { opacity: 0.4 },
            ]}
            disabled={isWeb || isCapturing}
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <View style={{ width: 44 }} />
        </View>
      </View>
    );
  }

  if (stage === "review" || stage === "select-line" || stage === "uploading") {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => {
              setError(null);
              setCaptured(null);
              setStage("shoot");
            }}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <Feather name="chevron-left" size={26} color={HT.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {stage === "select-line" ? "Attach to..." : "Review receipt"}
          </Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 120,
          }}
        >
          {captured ? (
            <View style={styles.previewWrap}>
              <RNImage source={{ uri: captured.uri }} style={styles.preview} resizeMode="contain" />
            </View>
          ) : null}

          {stage === "select-line" ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={styles.subLabel}>Choose a destination</Text>
              <Pressable
                onPress={() => upload(null)}
                style={({ pressed }) => [styles.lineRow, pressed && { backgroundColor: HT.surfaceAlt }]}
                disabled={uploadUrlMutation.isPending || registerMutation.isPending}
              >
                <View style={[styles.lineIcon, { backgroundColor: HT.tintTeal }]}>
                  <Feather name="folder" size={18} color={HT.teal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineMerchant}>Report inbox</Text>
                  <Text style={styles.lineMeta}>Attach later from a line item</Text>
                </View>
                <Feather name="chevron-right" size={20} color={HT.ink4} />
              </Pressable>
              {(reportQ.data?.lineItems ?? []).map((line: LineItem) => (
                <Pressable
                  key={line.id}
                  onPress={() => upload(line.id)}
                  style={({ pressed }) => [styles.lineRow, pressed && { backgroundColor: HT.surfaceAlt }]}
                  disabled={uploadUrlMutation.isPending || registerMutation.isPending}
                >
                  <View style={styles.lineIcon}>
                    <Feather name="receipt" size={18} color={HT.navy} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineMerchant}>{line.merchant}</Text>
                    <Text style={styles.lineMeta}>
                      {line.category} · {line.occurredOn}
                    </Text>
                  </View>
                  <Money value={line.amount} size={14} weight="700" />
                </Pressable>
              ))}
              {(reportQ.data?.lineItems ?? []).length === 0 ? (
                <Text style={[styles.body, { textAlign: "center", marginTop: 8 }]}>
                  No line items yet. Attach to the report inbox or add a line first.
                </Text>
              ) : null}
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {stage === "uploading" ? (
            <View style={styles.uploading}>
              <ActivityIndicator color={HT.navy} />
              <Text style={styles.uploadingText}>{progress || "Uploading..."}</Text>
            </View>
          ) : null}
        </ScrollView>

        {stage === "review" ? (
          <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Retake"
                  icon="refresh-ccw"
                  variant="secondary"
                  fullWidth
                  onPress={() => {
                    setCaptured(null);
                    setError(null);
                    setStage("shoot");
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Use photo"
                  icon="check"
                  fullWidth
                  onPress={proceedToLineSelect}
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  // done
  return (
    <View style={[styles.root, styles.center]}>
      <View style={[styles.iconBubble, { backgroundColor: HT.tintGreen }]}>
        <Feather name="check" size={28} color="#34604F" />
      </View>
      <Text style={styles.h1}>Receipt attached</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HT.canvas },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  iconBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: HT.tintNavy,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  h1: { fontFamily: "Inter_700Bold", fontSize: 20, color: HT.ink, marginTop: 6 },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: HT.ink3,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 6,
    maxWidth: 320,
  },
  cameraRoot: { flex: 1, backgroundColor: "#000" },
  cameraTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  cameraBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  cameraTitle: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  cameraBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 16,
    paddingHorizontal: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  libBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#FFFFFF",
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  iconBtn: { padding: 4 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: HT.ink },
  previewWrap: {
    backgroundColor: "#000",
    borderRadius: 16,
    overflow: "hidden",
    aspectRatio: 3 / 4,
  },
  preview: { width: "100%", height: "100%" },
  subLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: HT.ink3,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: HT.surface,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HT.border,
  },
  lineIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: HT.tintNavy,
    alignItems: "center",
    justifyContent: "center",
  },
  lineMerchant: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: HT.ink },
  lineMeta: { fontFamily: "Inter_500Medium", fontSize: 12, color: HT.ink3, marginTop: 2 },
  uploading: {
    marginTop: 18,
    alignItems: "center",
    gap: 8,
  },
  uploadingText: { fontFamily: "Inter_500Medium", color: HT.ink3 },
  errorText: { color: HT.danger, fontFamily: "Inter_500Medium", marginTop: 12 },
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
