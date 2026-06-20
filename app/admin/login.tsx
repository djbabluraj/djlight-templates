import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { adminLogin, adminMe } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

export default function AdminLogin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bootChecking, setBootChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const me = await adminMe();
      if (me) router.replace("/admin/dashboard");
      else setBootChecking(false);
    })();
  }, [router]);

  const submit = async () => {
    const e = email.trim();
    const p = password;
    if (!e && !p) {
      setErr("Enter the admin email and password to sign in");
      return;
    }
    if (!e) {
      setErr("Email is required");
      return;
    }
    if (!p) {
      setErr("Password is required");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      await adminLogin(e, p);
      router.replace("/admin/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const fillAdminCredentials = () => {
    setEmail("admin@djlights.com");
    setPassword("DjLights2026!");
    setErr(null);
  };

  if (bootChecking) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: spacing.lg,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={8}
          testID="admin-login-back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="key" size={26} color={colors.onBrand} />
          </View>
          <Text style={styles.title}>Admin Sign In</Text>
          <Text style={styles.sub}>Restricted access. Manage templates.</Text>
        </View>

        {__DEV__ && (
          <Pressable
            onPress={fillAdminCredentials}
            style={styles.demoCard}
            testID="admin-prefill"
          >
            <View style={styles.demoIcon}>
              <Ionicons name="sparkles" size={14} color={colors.onBrand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.demoTitle}>Dev shortcut · fill admin</Text>
              <Text style={styles.demoBody}>
                Only visible in development builds.
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={colors.brand} />
          </Pressable>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>EMAIL</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={16} color={colors.muted} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="admin@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              testID="admin-email-input"
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>PASSWORD</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.muted} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              secureTextEntry={!showPwd}
              autoCapitalize="none"
              style={styles.input}
              testID="admin-password-input"
            />
            <Pressable onPress={() => setShowPwd((s) => !s)} hitSlop={8}>
              <Ionicons
                name={showPwd ? "eye-off-outline" : "eye-outline"}
                size={16}
                color={colors.muted}
              />
            </Pressable>
          </View>
        </View>

        {err && (
          <View style={styles.errBox} testID="admin-login-error">
            <Ionicons name="alert-circle" size={14} color={colors.error} />
            <Text style={styles.errText}>{err}</Text>
          </View>
        )}

        <Pressable
          onPress={submit}
          disabled={loading}
          style={({ pressed }) => [
            styles.cta,
            { transform: [{ scale: pressed ? 0.98 : 1 }] },
            loading && { opacity: 0.7 },
          ]}
          testID="admin-login-submit"
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.onBrand} />
          ) : (
            <>
              <Text style={styles.ctaText}>Sign in</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.onBrand} />
            </>
          )}
        </Pressable>

        <View style={styles.hint}>
          <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
          <Text style={styles.hintText}>
            Use the credentials sent to you by the app owner.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  back: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  hero: { gap: 6, marginBottom: spacing.xl },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: "800" },
  sub: { color: colors.muted, fontSize: 14 },
  field: { marginBottom: spacing.lg, gap: spacing.sm },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    color: colors.onSurface,
    paddingVertical: spacing.md,
    fontSize: 15,
  },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,23,68,0.12)",
    borderWidth: 1,
    borderColor: colors.error,
    marginBottom: spacing.md,
  },
  errText: { color: colors.error, fontSize: 12, flex: 1 },
  cta: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    paddingVertical: spacing.md + 4,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  ctaText: { color: colors.onBrand, fontWeight: "800", fontSize: 15 },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.lg,
  },
  hintText: { color: colors.muted, fontSize: 11 },
  demoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.lg,
  },
  demoIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  demoTitle: { color: colors.brand, fontWeight: "800", fontSize: 13 },
  demoBody: {
    color: colors.onSurfaceSecondary,
    fontSize: 11,
    marginTop: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
