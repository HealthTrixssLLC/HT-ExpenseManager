import { Feather } from "@expo/vector-icons";
import {
  getGetReceiptDownloadUrlQueryKey,
  type Receipt,
  useGetReceiptDownloadUrl,
} from "@workspace/api-client-react";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import React from "react";
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
}: {
  receipt: Receipt | null;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const isImage = !!receipt && receipt.mimeType.startsWith("image/");
  const isPdf = !!receipt && receipt.mimeType === "application/pdf";
  const dlQuery = useGetReceiptDownloadUrl(receipt?.id ?? "", {
    query: {
      enabled: visible && !!receipt,
      staleTime: 60_000,
      queryKey: getGetReceiptDownloadUrlQueryKey(receipt?.id ?? ""),
    },
  });

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
      </View>
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
});
