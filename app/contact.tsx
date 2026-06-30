import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/src/theme";

const SUPPORT_EMAIL = "babluraj8088@gmail.com";
const SUPPORT_TELEGRAM = "https://telegram.me/Gyantechsupport"

type Channel = {
  id: string;
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  action: () => Promise<void> | void;
};

export default function Contact() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);

  const channels: Channel[] = [
    {
      id: "email",
      label: "Email Support",
      value: SUPPORT_EMAIL,
      icon: "mail",
      action: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`),
    },
    {
      id: "telegram",
      label: "Telegram Channel",
      value: SUPPORT_TELEGRAM,
      icon: "paper-plane",
      action: () => Linking.openURL(SUPPORT_TELEGRAM),
    },
  ];

  const copy = async (text: string, id: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <View style={styles.root} testID="contact-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Contact</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="headset" size={28} color={colors.onBrand} />
          </View>
          <Text style={styles.heroTitle}>We are here to help</Text>
          <Text style={styles.heroSub}>
            Send us a message and we&apos;ll get back within 24 hours.
          </Text>
        </View>

        {channels.map((c) => (
          <View key={c.id} style={styles.channel}>
            <View style={styles.channelLeft}>
              <View style={styles.channelIcon}>
                <Ionicons name={c.icon} size={18} color={colors.brand} />
              </View>
              <View>
                <Text style={styles.channelLabel}>{c.label}</Text>
                <Text style={styles.channelValue}>{c.value}</Text>
              </View>
            </View>
            <View style={styles.channelActions}>
              <Pressable
                onPress={() => copy(c.value, c.id)}
                style={styles.iconBtn}
                hitSlop={8}
                testID={`contact-copy-${c.id}`}
              >
                <Ionicons
                  name={copied === c.id ? "checkmark" : "copy-outline"}
                  size={16}
                  color={copied === c.id ? colors.brand : colors.onSurfaceSecondary}
                />
              </Pressable>
              <Pressable
                onPress={c.action}
                style={[styles.iconBtn, styles.openBtn]}
                hitSlop={8}
                testID={`contact-open-${c.id}`}
              >
                <Ionicons name="open-outline" size={16} color={colors.onBrand} />
              </Pressable>
            </View>
          </View>
        ))}

        <View style={styles.tip}>
          <Ionicons name="information-circle" size={16} color={colors.brand} />
          <Text style={styles.tipText}>
            Include your device model and the template name when reporting issues
            with downloads.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 17 },
  hero: { alignItems: "center", gap: spacing.sm, marginVertical: spacing.xl },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  heroSub: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    maxWidth: 280,
  },
  channel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  channelLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  channelIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  channelLabel: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  channelValue: { color: colors.muted, fontSize: 12, marginTop: 2 },
  channelActions: { flexDirection: "row", gap: spacing.sm },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  openBtn: { backgroundColor: colors.brand },
  tip: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    padding: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  tipText: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
});
