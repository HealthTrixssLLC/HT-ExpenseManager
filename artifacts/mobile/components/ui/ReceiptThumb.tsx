import { Feather } from "@expo/vector-icons";
import {
  type Receipt,
  useGetReceiptDownloadUrl,
} from "@workspace/api-client-react";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { HT } from "@/constants/colors";

export function ReceiptThumb({
  receipt,
  size = 96,
}: {
  receipt: Receipt;
  size?: number;
}) {
  const isImage = receipt.mimeType.startsWith("image/");
  const isPdf = receipt.mimeType === "application/pdf";
  const { data, isLoading, isError } = useGetReceiptDownloadUrl(receipt.id, {
    query: { enabled: isImage, staleTime: 60_000 },
  });

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: 12 },
      ]}
    >
      {isImage && data?.downloadURL ? (
        <Image
          source={{ uri: data.downloadURL }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={120}
        />
      ) : isImage && (isLoading || !isError) ? (
        <View style={styles.placeholder}>
          <Feather name="image" size={22} color={HT.ink4} />
        </View>
      ) : isPdf ? (
        <View style={[styles.placeholder, { backgroundColor: HT.tintTan }]}>
          <Feather name="file-text" size={22} color="#7A5512" />
          <Text style={styles.label}>PDF</Text>
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Feather name="paperclip" size={22} color={HT.ink4} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HT.border,
    backgroundColor: HT.surfaceAlt,
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: HT.tintGrey,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: "#7A5512",
    letterSpacing: 1,
  },
});
