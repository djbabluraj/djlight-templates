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
          DJ Light Templates is a free download library for DJ Light and Avee
          visual templates. We respect your privacy and do not require user
          accounts to browse or download templates.
        </Section>
        <Section title="2. Information we collect">
          We do not collect personally identifiable information. The app only
          stores anonymous download counts on our server to display popularity
          metrics for each template.
        </Section>
        <Section title="3. Templates & downloads">
          Template files are downloaded directly from our secure servers. When
          you tap Download, the file is saved to your device storage. We do
          not track which templates you download to your device.
        </Section>
        <Section title="4. Notifications">
          When you grant permission, we may send you a notification when a new
          template is published. You can disable this anytime from your device
          settings.
        </Section>
        <Section title="5. Third-party services">
          The app does not integrate any third-party analytics, advertising or
          tracking SDKs. Premium purchases (if enabled) are handled via the
          payment provider&apos;s own privacy policy.
        </Section>
        <Section title="6. Children">
          The app is rated for general audiences and does not knowingly collect
          information from children under 13.
        </Section>
        <Section title="7. Changes">
          We may update this policy from time to time. Continued use of the app
          means you accept the latest version.
        </Section>
        <Section title="8. Contact">
          Questions? Reach us via the Contact page in Settings.
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
