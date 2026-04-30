import { Feather } from "@expo/vector-icons";
import {
  ApiError,
  type LineItem,
  getGetReportQueryKey,
  useGetReport,
  useRegisterReceipt,
  useRequestUploadUrl,
} from "@workspace/api-client-react";
import {
  CameraView,
  useCameraPermissions,
  type CameraType,
} from "expo-camera";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
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

type Stage = "shoot" | "select-line" | "uploading" | "done";

type Captured = {
  uri: string;
  width?: number;
  height?: number;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  isPdf: boolean;
};

type Pending = Captured & {
  id: string;
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  lineItemId: string | null;
  attempts: number;
};

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "application/pdf",
];

function pickAlert(title: string, body: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(`${title}\n\n${body}`);
  } else {
    Alert.alert(title, body);
  }
}

export default function CaptureScreen() {
  const { id, lineId: preselectLineId } = useLocalSearchParams<{
    id: string;
    lineId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cameraRef = useRef<CameraView | null>(null);

  const reportQ = useGetReport(id, {
    query: { enabled: !!id, queryKey: getGetReportQueryKey(id) },
  });
  const uploadUrlMutation = useRequestUploadUrl();
  const registerMutation = useRegisterReceipt();

  const [permission, requestPermission] = useCameraPermissions();
  const [facing] = useState<CameraType>("back");
  const [stage, setStage] = useState<Stage>("shoot");
  const [pending, setPending] = useState<Pending[]>([]);
  const [activePendingId, setActivePendingId] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const handleClose = () => {
    if (pending.some((p) => p.status === "uploading" || p.status === "queued")) {
      pickAlert(
        "Uploads still in progress",
        "Wait for receipts to finish uploading, or remove them from the queue first.",
      );
      return;
    }
    router.back();
  };

  const isWeb = Platform.OS === "web";

  const ensureCameraPermission = async () => {
    if (isWeb) return true;
    if (permission?.granted) return true;
    const res = await requestPermission();
    return res.granted;
  };

  // ---- Capture / select sources -------------------------------------------

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
      addCaptured({
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
        mimeType: "image/jpeg",
        filename: `receipt-${Date.now()}.jpg`,
        sizeBytes: 0,
        isPdf: false,
      });
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "Failed to capture photo.");
    } finally {
      setIsCapturing(false);
    }
  };

  const pickFromLibrary = async () => {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      pickAlert("Permission required", "Allow Photos access to pick a receipt.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: 8,
    });
    if (res.canceled || !res.assets?.length) return;
    for (const a of res.assets) {
      const mime =
        a.mimeType ??
        (a.fileName?.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
      const ext = mime === "image/png" ? "png" : mime === "image/heic" ? "heic" : "jpg";
      addCaptured({
        uri: a.uri,
        width: a.width,
        height: a.height,
        mimeType: mime,
        filename: a.fileName ?? `receipt-${Date.now()}.${ext}`,
        sizeBytes: a.fileSize ?? 0,
        isPdf: false,
      });
    }
  };

  const pickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const mime = a.mimeType ?? "application/pdf";
    if (!ALLOWED_MIMES.includes(mime)) {
      pickAlert("File type not supported", `${mime} can't be uploaded.`);
      return;
    }
    addCaptured({
      uri: a.uri,
      mimeType: mime,
      filename: a.name ?? `receipt-${Date.now()}.pdf`,
      sizeBytes: a.size ?? 0,
      isPdf: mime === "application/pdf",
    });
  };

  const addCaptured = (c: Captured) => {
    setBannerError(null);
    setPending((arr) => [
      ...arr,
      {
        ...c,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: "queued",
        progress: 0,
        lineItemId: preselectLineId ?? null,
        attempts: 0,
      },
    ]);
  };

  const removeFromQueue = (pid: string) => {
    setPending((arr) => arr.filter((p) => p.id !== pid));
    if (activePendingId === pid) setActivePendingId(null);
  };

  // ---- Upload (with progress + retry) -------------------------------------

  const uploadOne = async (p: Pending) => {
    setPending((arr) =>
      arr.map((q) => (q.id === p.id ? { ...q, status: "uploading", progress: 0, error: undefined, attempts: q.attempts + 1 } : q)),
    );
    try {
      // 1. Build blob
      const fileResp = await fetch(p.uri);
      const blob = await fileResp.blob();
      const size = blob.size || p.sizeBytes;
      if (size > MAX_BYTES) {
        throw new Error("Receipt is larger than the 10 MB limit.");
      }
      const mime = blob.type || p.mimeType || "application/octet-stream";

      // 2. Get a signed PUT URL
      const upload = await uploadUrlMutation.mutateAsync({
        data: {
          reportId: id,
          name: p.filename,
          size,
          contentType: mime,
        },
      });

      // 3. PUT with progress (XHR for upload progress events; fetch lacks them)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", upload.uploadURL);
        xhr.setRequestHeader("Content-Type", mime);
        xhr.upload.onprogress = (ev) => {
          if (!ev.lengthComputable) return;
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setPending((arr) =>
            arr.map((q) => (q.id === p.id ? { ...q, progress: pct } : q)),
          );
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status}).`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.ontimeout = () => reject(new Error("Upload timed out."));
        xhr.send(blob);
      });

      // 4. Register the receipt
      await registerMutation.mutateAsync({
        id,
        data: {
          objectPath: upload.objectPath,
          filename: p.filename,
          mimeType: mime,
          sizeBytes: size,
          lineItemId: p.lineItemId,
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPending((arr) =>
        arr.map((q) => (q.id === p.id ? { ...q, status: "done", progress: 100 } : q)),
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Upload failed.";
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setPending((arr) =>
        arr.map((q) => (q.id === p.id ? { ...q, status: "error", error: msg } : q)),
      );
    }
  };

  const uploadAll = async (assignments: Record<string, string | null>) => {
    setStage("uploading");
    // Apply lineItem assignments
    const assigned = pending.map((p) => ({ ...p, lineItemId: assignments[p.id] ?? p.lineItemId }));
    setPending(assigned);

    for (const p of assigned) {
      if (p.status === "done") continue;
      // eslint-disable-next-line no-await-in-loop -- serial uploads keep order + reduce thrash
      await uploadOne(p);
    }

    // If anything still failing, leave user on this screen so they can retry
    setPending((arr) => {
      const stillPending = arr.some((p) => p.status !== "done");
      if (!stillPending) {
        setTimeout(() => router.back(), 500);
      }
      return arr;
    });
  };

  const retryFailed = async () => {
    const failures = pending.filter((p) => p.status === "error");
    setStage("uploading");
    for (const p of failures) {
      // eslint-disable-next-line no-await-in-loop
      await uploadOne(p);
    }
  };

  // ---- Foreground retry — auto-retry failed items when app resumes --------

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next !== "active") return;
      const hasFailures = pending.some((p) => p.status === "error");
      if (hasFailures && stage !== "uploading") retryFailed();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, stage]);

  // ---- Render -------------------------------------------------------------

  if (!id) return null;

  const lineItems = (reportQ.data?.lineItems ?? []) as LineItem[];
  const hasUploaded = pending.some((p) => p.status === "done");
  const allDone = pending.length > 0 && pending.every((p) => p.status === "done");
  const inProgress = pending.some((p) => p.status === "uploading");

  if (!isWeb && permission && !permission.granted && stage === "shoot" && pending.length === 0) {
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
            onPress={ensureCameraPermission}
          />
          <PrimaryButton
            title="Pick from library"
            icon="image"
            variant="secondary"
            fullWidth
            onPress={pickFromLibrary}
          />
          <PrimaryButton
            title="Pick a PDF"
            icon="file-text"
            variant="secondary"
            fullWidth
            onPress={pickPdf}
          />
          <PrimaryButton title="Cancel" variant="ghost" fullWidth onPress={handleClose} />
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
          <Pressable onPress={pickPdf} style={styles.cameraBtn} hitSlop={8}>
            <Feather name="file-text" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Captured strip */}
        {pending.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.stripScroll}
            contentContainerStyle={styles.strip}
          >
            {pending.map((p) => (
              <Pressable
                key={p.id}
                style={({ pressed }) => [styles.stripItem, pressed && { opacity: 0.7 }]}
                onLongPress={() => removeFromQueue(p.id)}
                accessibilityHint="Long-press to remove"
              >
                {p.isPdf ? (
                  <View style={[styles.stripPlaceholder, { backgroundColor: "rgba(243, 219, 177, 0.85)" }]}>
                    <Feather name="file-text" size={20} color="#7A5512" />
                    <Text style={styles.stripPdfLabel}>PDF</Text>
                  </View>
                ) : (
                  <RNImage source={{ uri: p.uri }} style={styles.stripImg} />
                )}
                <View style={styles.stripCount}>
                  <Text style={styles.stripCountText}>{pending.indexOf(p) + 1}</Text>
                </View>
              </Pressable>
            ))}
            <Pressable onPress={pickFromLibrary} style={styles.stripAdd} hitSlop={6}>
              <Feather name="plus" size={20} color="#FFFFFF" />
            </Pressable>
          </ScrollView>
        ) : null}

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
          {pending.length > 0 ? (
            <Pressable
              onPress={() => setStage("select-line")}
              style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.85 }]}
              hitSlop={8}
            >
              <Text style={styles.nextBtnText}>Next</Text>
              <Feather name="arrow-right" size={18} color="#FFFFFF" />
            </Pressable>
          ) : (
            <View style={{ width: 84 }} />
          )}
        </View>

        {bannerError ? (
          <View style={[styles.bannerErr, { top: insets.top + 60 }]}>
            <Text style={styles.bannerErrText}>{bannerError}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  // select-line + uploading both render the assignment list
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => {
            if (stage === "uploading" && inProgress) return;
            if (allDone) {
              router.back();
              return;
            }
            setStage("shoot");
          }}
          hitSlop={8}
          style={styles.iconBtn}
          disabled={stage === "uploading" && inProgress}
        >
          <Feather
            name={allDone ? "x" : "chevron-left"}
            size={26}
            color={inProgress ? HT.ink4 : HT.ink}
          />
        </Pressable>
        <Text style={styles.headerTitle}>
          {stage === "uploading" ? "Uploading receipts" : "Attach to..."}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 140 }}>
        <Text style={styles.sectionLabel}>
          {pending.length} receipt{pending.length === 1 ? "" : "s"} to upload
        </Text>

        {pending.map((p) => (
          <PendingRow
            key={p.id}
            p={p}
            lineItems={lineItems}
            disabled={stage === "uploading"}
            onAssign={(lineItemId) =>
              setPending((arr) =>
                arr.map((q) => (q.id === p.id ? { ...q, lineItemId } : q)),
              )
            }
            onRetry={() => uploadOne(p)}
            onRemove={() => removeFromQueue(p.id)}
            isExpanded={activePendingId === p.id}
            onToggle={() => setActivePendingId(activePendingId === p.id ? null : p.id)}
          />
        ))}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
        {allDone ? (
          <PrimaryButton
            title="Done"
            icon="check"
            fullWidth
            size="lg"
            variant="accent"
            onPress={() => router.back()}
          />
        ) : stage === "uploading" ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator color={HT.navy} />
              <Text style={styles.uploadingText}>
                Uploading {pending.filter((p) => p.status === "done").length}/{pending.length}…
              </Text>
            </View>
            {pending.some((p) => p.status === "error") && !inProgress ? (
              <PrimaryButton
                title="Retry failed"
                icon="rotate-ccw"
                variant="secondary"
                fullWidth
                onPress={retryFailed}
              />
            ) : null}
          </View>
        ) : (
          <PrimaryButton
            title={hasUploaded ? "Upload remaining" : `Upload ${pending.length} receipt${pending.length === 1 ? "" : "s"}`}
            icon="upload-cloud"
            fullWidth
            size="lg"
            disabled={pending.length === 0}
            onPress={() => {
              const map: Record<string, string | null> = {};
              for (const p of pending) map[p.id] = p.lineItemId;
              uploadAll(map);
            }}
          />
        )}
      </View>
    </View>
  );
}

function PendingRow({
  p,
  lineItems,
  disabled,
  onAssign,
  onRetry,
  onRemove,
  isExpanded,
  onToggle,
}: {
  p: Pending;
  lineItems: LineItem[];
  disabled: boolean;
  onAssign: (lineItemId: string | null) => void;
  onRetry: () => void;
  onRemove: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const target = p.lineItemId ? lineItems.find((l) => l.id === p.lineItemId) : null;

  return (
    <View style={styles.pendingCard}>
      <Pressable onPress={onToggle} style={styles.pendingHead}>
        <View style={styles.pendingThumb}>
          {p.isPdf ? (
            <Feather name="file-text" size={20} color="#7A5512" />
          ) : (
            <RNImage source={{ uri: p.uri }} style={{ width: 44, height: 44, borderRadius: 8 }} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pendingName} numberOfLines={1}>{p.filename}</Text>
          <Text style={styles.pendingMeta}>
            {target ? `→ ${target.merchant}` : "Attach to report inbox"}
          </Text>
          {p.status === "uploading" ? (
            <View style={styles.progressBarOuter}>
              <View style={[styles.progressBarInner, { width: `${p.progress}%` }]} />
            </View>
          ) : null}
          {p.status === "error" ? (
            <Text style={styles.pendingErr}>{p.error}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {p.status === "queued" ? (
            <Pressable onPress={onRemove} hitSlop={6} disabled={disabled}>
              <Feather name="x" size={18} color={HT.ink4} />
            </Pressable>
          ) : p.status === "uploading" ? (
            <Text style={styles.pendingStatus}>{p.progress}%</Text>
          ) : p.status === "done" ? (
            <Feather name="check-circle" size={20} color={HT.success} />
          ) : (
            <Pressable onPress={onRetry} hitSlop={6} disabled={disabled}>
              <Feather name="rotate-ccw" size={18} color={HT.warning} />
            </Pressable>
          )}
        </View>
      </Pressable>

      {isExpanded && p.status !== "done" ? (
        <View style={styles.assignList}>
          <AssignRow
            label="Report inbox"
            sub="Attach later from a line item"
            selected={p.lineItemId === null}
            onPress={() => onAssign(null)}
          />
          {lineItems.map((line) => (
            <AssignRow
              key={line.id}
              label={line.merchant}
              sub={`${line.category} · ${line.occurredOn}`}
              right={<Money value={line.amount} size={13} weight="700" />}
              selected={p.lineItemId === line.id}
              onPress={() => onAssign(line.id)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AssignRow({
  label,
  sub,
  right,
  selected,
  onPress,
}: {
  label: string;
  sub: string;
  right?: React.ReactNode;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.assignRow,
        selected && { backgroundColor: HT.tintNavy, borderColor: HT.navy },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.assignDot, selected && { backgroundColor: HT.navy, borderColor: HT.navy }]}>
        {selected ? <Feather name="check" size={11} color="#FFFFFF" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.assignLabel}>{label}</Text>
        <Text style={styles.assignSub}>{sub}</Text>
      </View>
      {right}
    </Pressable>
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
  stripScroll: {
    position: "absolute",
    bottom: 140,
    left: 0,
    right: 0,
    maxHeight: 88,
  },
  strip: { paddingHorizontal: 16, gap: 10, alignItems: "center" },
  stripItem: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    position: "relative",
  },
  stripImg: { width: "100%", height: "100%" },
  stripPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  stripPdfLabel: { fontFamily: "Inter_700Bold", fontSize: 9, color: "#7A5512", letterSpacing: 1 },
  stripCount: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  stripCountText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 10 },
  stripAdd: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 16,
    paddingHorizontal: 24,
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
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: HT.orange,
  },
  nextBtnText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 14 },
  bannerErr: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: HT.danger,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bannerErrText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  iconBtn: { padding: 4 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: HT.ink },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: HT.ink3,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  pendingCard: {
    backgroundColor: HT.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HT.border,
    marginBottom: 10,
    overflow: "hidden",
  },
  pendingHead: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
  pendingThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: HT.tintTan,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pendingName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: HT.ink },
  pendingMeta: { fontFamily: "Inter_500Medium", fontSize: 12, color: HT.ink3, marginTop: 2 },
  pendingErr: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: HT.danger,
    marginTop: 4,
  },
  pendingStatus: { fontFamily: "Inter_700Bold", fontSize: 12, color: HT.navy },
  progressBarOuter: {
    marginTop: 6,
    height: 4,
    borderRadius: 2,
    backgroundColor: HT.border,
    overflow: "hidden",
  },
  progressBarInner: { height: 4, backgroundColor: HT.teal },
  assignList: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HT.border,
  },
  assignRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: HT.border,
    marginTop: 8,
  },
  assignDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: HT.borderStrong,
    backgroundColor: HT.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  assignLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: HT.ink },
  assignSub: { fontFamily: "Inter_500Medium", fontSize: 11, color: HT.ink3, marginTop: 1 },
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
  uploadingText: { fontFamily: "Inter_500Medium", color: HT.ink3, fontSize: 13 },
});
