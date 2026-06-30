import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/src/theme";

export default function Privacy() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={styles.root} testID="privacy-screen">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.updated}>Last updated · May 2026</Text>
        <Section title="1. Overview">
DJ Light Templates provides DJ Light and Avee Player visual templates for browsing and downloading. We respect user privacy and aim to provide a safe experience.
</Section>

<Section title="2. Information We Collect">
The application does not require account registration. Limited technical information may be processed for downloads, notifications, security and app performance.
</Section>

<Section title="3. Downloads & Storage">
When you download a template, the file is saved to your selected device storage location. The application does not access your personal photos, videos, contacts or private files.
</Section>

<Section title="4. Notifications">
If permission is granted, the application may send notifications about new templates, updates and important announcements. Notifications can be disabled anytime from device settings.
</Section>

<Section title="5. Advertising">
The application may display advertisements through Google AdMob or other advertising partners. Advertising providers may collect device identifiers and usage information according to their own privacy policies.
</Section>

<Section title="6. Third-Party Services">
The application may use Google AdMob, Google Play Services and Firebase services (if enabled). These services operate under their own privacy policies.
</Section>

<Section title="7. Children">
The application is intended for a general audience and does not knowingly collect personal information from children under 13 years of age.
</Section>

<Section title="8. Data Security">
Reasonable security measures are used to protect application services and downloaded content.
</Section>

<Section title="9. Policy Updates">
This Privacy Policy may be updated from time to time. Continued use of the application indicates acceptance of the latest version.
</Section>

<Section title="10. Contact">
Email: babluraj8088@gmail.com

Telegram: https://t.me/Gyantechsupport
</Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
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
  updated: { color: colors.muted, fontSize: 12, marginTop: spacing.lg },
  section: { marginTop: spacing.lg, gap: spacing.sm },
  sectionTitle: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  body: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 22 },
});
