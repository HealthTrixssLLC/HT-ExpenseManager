import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { HT } from "@/constants/colors";

const ICON = require("@/assets/images/icon.png");

export function BrandLockup({ size = 28 }: { size?: number }) {
  return (
    <View style={styles.lockup}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.22,
          overflow: "hidden",
          backgroundColor: HT.navy,
        }}
      >
        <Image source={ICON} style={{ width: size, height: size }} contentFit="cover" />
      </View>
      <View>
        <Text style={styles.name}>Healthtrix</Text>
        <Text style={styles.tag}>EXPENSE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: HT.navy,
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  tag: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    color: HT.ink3,
    letterSpacing: 1.4,
    marginTop: 2,
  },
});
