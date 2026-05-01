import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { HT } from "@/constants/colors";
import type { HelpBlock } from "@/lib/help/types";

const calloutTones: Record<
  NonNullable<Extract<HelpBlock, { type: "callout" }>["tone"]>,
  { bg: string; border: string; chip: string; icon: keyof typeof Feather.glyphMap }
> = {
  info: { bg: HT.tintNavy, border: HT.border, chip: HT.navy, icon: "info" },
  warning: {
    bg: HT.warningTint,
    border: HT.warning,
    chip: HT.warning,
    icon: "alert-triangle",
  },
  tip: {
    bg: HT.successTint,
    border: HT.success,
    chip: HT.success,
    icon: "zap",
  },
  success: {
    bg: HT.successTint,
    border: HT.success,
    chip: HT.success,
    icon: "check-circle",
  },
};

export function RenderHelpBlock({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case "p":
      return <Text style={styles.p}>{block.text}</Text>;
    case "h":
      return <Text style={styles.h}>{block.text}</Text>;
    case "ol":
      return (
        <View style={styles.list}>
          {block.items.map((it, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.listNum}>{i + 1}.</Text>
              <Text style={styles.listText}>{it}</Text>
            </View>
          ))}
        </View>
      );
    case "ul":
      return (
        <View style={styles.list}>
          {block.items.map((it, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.listBullet}>•</Text>
              <Text style={styles.listText}>{it}</Text>
            </View>
          ))}
        </View>
      );
    case "callout": {
      const tone = block.tone ?? "info";
      const t = calloutTones[tone];
      return (
        <View
          style={[
            styles.callout,
            { backgroundColor: t.bg, borderColor: t.border },
          ]}
        >
          <Feather name={t.icon} size={16} color={t.chip} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            {block.title ? (
              <Text style={[styles.calloutTitle, { color: t.chip }]}>{block.title}</Text>
            ) : null}
            <Text style={styles.calloutBody}>{block.text}</Text>
          </View>
        </View>
      );
    }
    case "kv":
      return (
        <View style={styles.kvWrap}>
          {block.rows.map((row, i) => (
            <View
              key={i}
              style={[
                styles.kvRow,
                i > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: HT.border,
                },
              ]}
            >
              <Text style={styles.kvKey}>{row.k}</Text>
              <Text style={styles.kvVal}>{row.v}</Text>
            </View>
          ))}
        </View>
      );
    case "diagram":
      return (
        <View style={styles.diagram}>
          <Text style={styles.diagramLabel}>States</Text>
          <View style={styles.nodeRow}>
            {block.nodes.map((n) => (
              <View key={n} style={styles.nodeChip}>
                <Text style={styles.nodeChipText}>{n}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.diagramLabel, { marginTop: 12 }]}>Transitions</Text>
          {block.edges.map((e, i) => (
            <View
              key={i}
              style={[
                styles.edgeRow,
                i % 2 === 1 && { backgroundColor: HT.surfaceAlt },
              ]}
            >
              <Text style={styles.edgeNode}>{e.from}</Text>
              <Feather name="arrow-right" size={12} color={HT.ink4} />
              <Text style={styles.edgeNode}>{e.to}</Text>
              {e.label ? (
                <Text style={styles.edgeLabel}>{e.label}</Text>
              ) : null}
            </View>
          ))}
        </View>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  p: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 22,
    color: HT.ink2,
    marginBottom: 12,
  },
  h: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: HT.ink,
    marginTop: 16,
    marginBottom: 6,
  },
  list: { marginBottom: 14 },
  listRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  listNum: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: HT.navy,
    minWidth: 22,
  },
  listBullet: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: HT.navy,
    lineHeight: 18,
    width: 14,
  },
  listText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22, color: HT.ink2 },
  callout: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginVertical: 8,
  },
  calloutTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  calloutBody: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: HT.ink,
    lineHeight: 20,
  },
  kvWrap: {
    borderWidth: 1,
    borderColor: HT.border,
    borderRadius: 10,
    backgroundColor: HT.surface,
    overflow: "hidden",
    marginBottom: 14,
  },
  kvRow: { paddingHorizontal: 12, paddingVertical: 10 },
  kvKey: { fontFamily: "Inter_700Bold", fontSize: 13, color: HT.ink, marginBottom: 4 },
  kvVal: { fontFamily: "Inter_400Regular", fontSize: 14, color: HT.ink2, lineHeight: 20 },
  diagram: {
    borderWidth: 1,
    borderColor: HT.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: HT.surface,
    marginBottom: 14,
  },
  diagramLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: HT.ink3,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  nodeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  nodeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: HT.tintNavy,
    borderWidth: 1,
    borderColor: HT.border,
  },
  nodeChipText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: HT.navy },
  edgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    flexWrap: "wrap",
  },
  edgeNode: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: HT.ink },
  edgeLabel: {
    flex: 1,
    textAlign: "right",
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: HT.ink3,
    fontStyle: "italic",
  },
});
