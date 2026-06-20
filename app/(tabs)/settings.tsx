import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/src/theme";
import {
  clearSavedDownloadDir,
  ensureSafDir,
  getSavedFolderLabel,
  hasSavedDownloadDir,
} from "@/src/utils/downloader";

type Row = {
  id: string;
  label: string;
  sub?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  testID: string;
};

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [folderLabel, setFolderLabel] = useState<string | null>(null);

  const refreshFolder = useCallback(async () => {
    if (Platform.OS !== "android") return;
    const has = await hasSavedDownloadDir().catch(() => false);
    if (has) {
      const label = await getSavedFolderLabel().catch(() => null);
      setFolderLabel(label);
    } else {
      setFolderLabel(null);
    }
  }, []);

  useEffect(() => {
    refreshFolder();
  }, [refreshFolder]);

  const handleChangeFolder = useCallback(async () => {
    if (Platform.OS !== "android") return;
    await clearSavedDownloadDir();
    const uri = await ensureSafDir();
    if (uri) {
      const label = await getSavedFolderLabel();
      setFolderLabel(label);
      Alert.alert(
        "Folder set",
        `New downloads will save to “${label}”.`,
      );
    } else {
      setFolderLabel(null);
      Alert.alert(
        "No folder selected",
        "You'll be asked to pick a folder the next time you download.",
      );
    }
  }, []);

  const baseRows: Row[] = [
    {
      id: "privacy",
      label: "Privacy Policy",
      sub: "How we handle your data",
      icon: "shield-checkmark-outline",
      onPress: () => router.push("/privacy"),
      testID: "settings-privacy",
    },
    {
      id: "contact",
      label: "Contact Us",
      sub: "Reach out to support",
      icon: "mail-outline",
      onPress: () => router.push("/contact"),
      testID: "settings-contact",
    },
    {
      id: "rate",
      label: "Rate the App",
      sub: "Share what you think",
      icon: "star-outline",
      onPress: () => Linking.openURL("https://play.google.com"),
      testID: "settings-rate",
    },
    {
      id: "admin",
      label: "Admin Panel",
      sub: "Manage templates",
      icon: "lock-closed-outline",
      onPress: () => router.push("/admin/login"),
      testID: "settings-admin",
    },
  ];

  const rows: Row[] =
    Platform.OS === "android"
      ? [
          {
            id: "download-folder",
            label: folderLabel
              ? `Download folder · ${folderLabel}`
              : "Choose download folder",
            sub: folderLabel
              ? "Tap to pick a different folder"
              : "Pick where your .viz files are saved",
            icon: "folder-outline",
            onPress: handleChangeFolder,
            testID: "settings-download-folder",
          },
          ...baseRows,
        ]
      : baseRows;

  return (
    <View style={styles.root} testID="settings-screen">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.lg,
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>SETTINGS</Text>
          <Text style={styles.title}>Preferences</Text>
        </View>

        <View style={styles.card}>
          {rows.map((r, idx) => (
            <Pressable
              key={r.id}
              onPress={r.onPress}
              testID={r.testID}
              style={({ pressed }) => [
                styles.row,
                idx !== rows.length - 1 && styles.rowDivider,
                pressed && { backgroundColor: colors.surfaceTertiary },
              ]}
            >
              <View style={styles.rowIcon}>
                <Ionicons name={r.icon} size={18} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                {r.sub && <Text style={styles.rowSub}>{r.sub}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        <View style={styles.footer}>
          <Image
            source={require("../../assets/images/header-logo.png")}
            style={{ width: 56, height: 56, borderRadius: 14 }}
            contentFit="contain"
          />
          <Text style={styles.footerTitle}>DJ Light Templates</Text>
          <Text style={styles.footerSub}>Version 1.0.0 · Free download library</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { marginBottom: spacing.lg },
  kicker: {
    color: colors.brand,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
    marginBottom: 2,
  },
  title: {
    color: colors.onSurface,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    gap: spacing.md,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "700",
  },
  rowSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  footer: {
    alignItems: "center",
    marginTop: spacing.xxl,
    gap: spacing.sm,
  },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  footerTitle: {
    color: colors.onSurface,
    fontWeight: "800",
    fontSize: 15,
  },
  footerSub: { color: colors.muted, fontSize: 12 },
});
