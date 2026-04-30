import { Feather } from "@expo/vector-icons";
import {
  getGetReceiptDownloadUrlQueryKey,
  type LineItem,
  type Receipt,
  useGetReceiptDownloadUrl,
} from "@workspace/api-client-react";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HT } from "@/constants/colors";
import { PrimaryButton } from "./PrimaryButton";

export function ReceiptViewer({
  receipt,
  visible,
  onClose,
  lines,
  canEdit,
  onAttach,
  onDetach,
  isMutating,
}: {
  receipt: Receipt | null;
  visible: boolean;
  onClose: () => void;
  // Optional: when provided, viewer surfaces attach/detach controls.
  lines?: LineItem[];
  canEdit?: boolean;
  onAttach?: (receipt: Receipt, lineId: string) => Promise<void> | void;
  onDetach?: (receipt: Receipt) => Promise<void> | void;
  isMutating?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const isImage = !!receipt && receipt.mimeType.startsWith("image/");
  const isPdf = !!receipt && receipt.mimeType === "application/pdf";
  const [pickerOpen, setPickerOpen] = useState(false);
  const dlQuery = useGetReceiptDownloadUrl(receipt?.id ?? "", {
    query: {
      enabled: visible && !!receipt,
      staleTime: 60_000,
      queryKey: getGetReceiptDownloadUrlQueryKey(receipt?.id ?? ""),
    },
  });

  const showAttachBar =
    !!receipt && !!canEdit && !!onAttach && !!lines && lines.length > 0;
  const attachedLine =
    !!receipt && !!receipt.lineItemId && lines
      ? lines.find((l) => l.id === receipt.lineItemId)
      : null;

  const openExternal = () => {
    if (dlQuery.data?.downloadURL) {
      Linking.openURL(dlQuery.data.downloadURL).catch(() => {});
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={10}>
            <Feather name="x" size={22} color="#FFFFFF" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {receipt?.filename ?? "Receipt"}
            </Text>
            {receipt?.sizeBytes ? (
              <Text style={styles.subtitle}>{formatBytes(receipt.sizeBytes)}</Text>
            ) : null}
          </View>
          {dlQuery.data?.downloadURL ? (
            <Pressable onPress={openExternal} style={styles.iconBtn} hitSlop={10}>
              <Feather name="external-link" size={20} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.body}
          maximumZoomScale={Platform.OS === "ios" ? 4 : 1}
          minimumZoomScale={1}
        >
          {dlQuery.isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : dlQuery.isError ? (
            <View style={styles.errorBox}>
              <Feather name="alert-triangle" size={24} color={HT.warning} />
              <Text style={styles.errorText}>Couldn't load receipt</Text>
            </View>
          ) : isImage && dlQuery.data?.downloadURL ? (
            <Image
              source={{ uri: dlQuery.data.downloadURL }}
              style={styles.image}
              contentFit="contain"
              transition={120}
            />
          ) : isPdf ? (
            <View style={styles.pdfCard}>
              <Feather name="file-text" size={48} color={HT.tan} />
              <Text style={styles.pdfTitle}>PDF receipt</Text>
              <Text style={styles.pdfSub}>
                Tap "Open" to view this PDF in your browser.
              </Text>
              <View style={{ marginTop: 18, width: 220 }}>
                <PrimaryButton
                  title="Open PDF"
                  icon="external-link"
                  variant="accent"
                  fullWidth
                  onPress={openExternal}
                />
              </View>
            </View>
          ) : (
            <View style={styles.errorBox}>
              <Feather name="paperclip" size={28} color="#FFFFFF80" />
              <Text style={styles.errorText}>Unsupported file type</Text>
            </View>
          )}
        </ScrollView>

        {showAttachBar ? (
          <View style={[styles.attachBar, { paddingBottom: insets.bottom + 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.attachLabel}>
                {attachedLine ? "Attached to" : "Unattached"}
              </Text>
              <Text style={styles.attachValue} numberOfLines={1}>
                {attachedLine
                  ? `${attachedLine.merchant} · ${attachedLine.category}`
                  : "Pick a line item below"}
              </Text>
            </View>
            {attachedLine && onDetach ? (
              <Pressable
                onPress={() => onDetach(receipt!)}
                disabled={!!isMutating}
                style={styles.attachIconBtn}
                hitSlop={10}
              >
                <Feather name="x" size={18} color="#FFFFFF" />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setPickerOpen(true)}
              disabled={!!isMutating}
              style={styles.attachBtn}
            >
              {isMutating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="link" size={16} color="#FFFFFF" />
                  <Text style={styles.attachBtnText}>
                    {attachedLine ? "Change" : "Attach"}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Line picker */}
      {showAttachBar ? (
        <Modal
          visible={pickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerOpen(false)}
        >
          <Pressable
            style={styles.pickerBackdrop}
            onPress={() => setPickerOpen(false)}
          >
            <Pressable
              style={[styles.pickerSheet, { paddingBottom: insets.bottom + 12 }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.pickerHandle} />
              <Text style={styles.pickerTitle}>Attach to line item</Text>
              <ScrollView style={{ maxHeight: 360 }}>
                {(lines ?? []).map((line) => {
                  const selected = line.id === receipt?.lineItemId;
                  return (
                    <Pressable
                      key={line.id}
                      onPress={async () => {
                        setPickerOpen(false);
                        if (receipt && onAttach) {
                          await onAttach(receipt, line.id);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.pickerRow,
                        selected && { backgroundColor: HT.tintNavy },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerRowName} numberOfLines={1}>
                          {line.merchant}
                        </Text>
                        <Text style={styles.pickerRowSub}>
                          {line.category} · ${line.amount}
                        </Text>
                      </View>
                      {selected ? (
                        <Feather name="check" size={18} color={HT.navy} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </Modal>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.96)" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  title: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  subtitle: { color: "#FFFFFF99", fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 2 },
  body: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  image: { width: "100%", height: "100%", aspectRatio: 0.7 },
  errorBox: { alignItems: "center", gap: 10 },
  errorText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  pdfCard: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  pdfTitle: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    marginTop: 12,
  },
  pdfSub: {
    color: "#FFFFFFB0",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
    maxWidth: 280,
  },
  attachBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  attachLabel: {
    color: "#FFFFFF80",
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  attachValue: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginTop: 2,
  },
  attachBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: HT.orange,
  },
  attachBtnText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  attachIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: HT.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  pickerHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: HT.border,
    marginBottom: 8,
  },
  pickerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: HT.ink,
    paddingVertical: 8,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: HT.border,
    gap: 10,
  },
  pickerRowName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: HT.ink,
  },
  pickerRowSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: HT.ink3,
    marginTop: 2,
  },
});
