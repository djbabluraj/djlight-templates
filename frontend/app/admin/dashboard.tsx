import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  adminDeleteTemplate,
  adminListTemplates,
  adminLogout,
  adminMe,
  TemplateMeta,
} from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

import { toDataUri } from "../(tabs)";

export default function AdminDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [me, setMe] = useState<{ email: string } | null>(null);
  const [items, setItems] = useState<TemplateMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profile = await adminMe();
      if (!profile) {
        router.replace("/admin/login");
        return;
      }
      setMe(profile);
      const list = await adminListTemplates();
      setItems(list);
    } catch {
      router.replace("/admin/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await adminDeleteTemplate(id);
      setItems((arr) => arr.filter((t) => t.id !== id));
    } catch (e) {
      console.warn(e);
    } finally {
      setDeletingId(null);
    }
  };

  const logout = async () => {
    await adminLogout();
    router.replace("/admin/login");
  };

  const freeCount = items.filter((t) => t.template_type === "free").length;
  const premiumCount = items.length - freeCount;
  const totalDownloads = items.reduce((s, t) => s + (t.downloads || 0), 0);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="admin-dashboard">
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View>
          <Text style={styles.kicker}>ADMIN</Text>
          <Text style={styles.title}>Templates</Text>
          {me && <Text style={styles.who}>Signed in as {me.email}</Text>}
        </View>
        <Pressable
          onPress={logout}
          style={styles.logoutBtn}
          hitSlop={6}
          testID="admin-logout"
        >
          <Ionicons name="log-out-outline" size={18} color={colors.onSurface} />
        </Pressable>
      </View>

      <View style={styles.statRow}>
        <StatChip icon="albums-outline" label="Total" value={items.length} />
        <StatChip icon="gift-outline" label="Free" value={freeCount} />
        <StatChip icon="diamond-outline" label="Premium" value={premiumCount} />
        <StatChip
          icon="cloud-download-outline"
          label="Downloads"
          value={totalDownloads}
        />
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + 120,
          gap: spacing.md,
        }}
        renderItem={({ item }) => (
          <View style={styles.row} testID={`admin-row-${item.id}`}>
            <View style={styles.rowThumb}>
              {item.thumbnail_base64 ? (
                <Image
                  source={{ uri: toDataUri(item.thumbnail_base64) }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : (
                <Ionicons name="image-outline" size={20} color={colors.muted} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <View style={styles.rowMeta}>
                <View
                  style={[
                    styles.miniBadge,
                    item.template_type === "premium"
                      ? styles.miniBadgePremium
                      : styles.miniBadgeFree,
                  ]}
                >
                  <Text
                    style={[
                      styles.miniBadgeText,
                      item.template_type === "premium"
                        ? { color: colors.onBrand }
                        : { color: colors.brand },
                    ]}
                  >
                    {item.template_type.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.rowMetaText}>
                  {item.downloads} downloads
                </Text>
                {item.template_type === "premium" && (
                  <Text style={styles.rowPrice}>
                    ${item.price.toFixed(2)}
                  </Text>
                )}
              </View>
            </View>
            <Pressable
              onPress={() => router.push(`/admin/upload?id=${item.id}`)}
              style={[styles.deleteBtn, styles.editBtn]}
              hitSlop={6}
              testID={`admin-edit-${item.id}`}
            >
              <Ionicons name="create-outline" size={16} color={colors.brand} />
            </Pressable>
            <Pressable
              onPress={() => handleDelete(item.id)}
              style={styles.deleteBtn}
              hitSlop={6}
              testID={`admin-delete-${item.id}`}
              disabled={deletingId === item.id}
            >
              {deletingId === item.id ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Ionicons name="trash-outline" size={16} color={colors.error} />
              )}
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="cloud-upload-outline" size={28} color={colors.brand} />
            </View>
            <Text style={styles.emptyTitle}>No templates yet</Text>
            <Text style={styles.emptyBody}>
              Tap the button below to publish your first template.
            </Text>
          </View>
        }
      />

      <Pressable
        onPress={() => router.push("/admin/upload")}
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        testID="admin-fab-upload"
      >
        <Ionicons name="add" size={22} color={colors.onBrand} />
        <Text style={styles.fabText}>New Template</Text>
      </Pressable>
    </View>
  );
}

function StatChip({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={14} color={colors.brand} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  kicker: {
    color: colors.brand,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "800",
  },
  title: {
    color: colors.onSurface,
    fontSize: 26,
    fontWeight: "800",
    marginTop: 2,
  },
  who: { color: colors.muted, fontSize: 11, marginTop: 4 },
  logoutBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  statRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.md,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  statValue: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    gap: spacing.md,
  },
  rowThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  rowTitle: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  rowMetaText: { color: colors.muted, fontSize: 11 },
  rowPrice: { color: colors.brand, fontSize: 11, fontWeight: "800" },
  miniBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  miniBadgeFree: {
    backgroundColor: "rgba(196,251,109,0.18)",
    borderWidth: 1,
    borderColor: colors.brand,
  },
  miniBadgePremium: { backgroundColor: colors.brand },
  miniBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,23,68,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  editBtn: {
    backgroundColor: colors.brandTertiary,
    marginRight: 6,
  },
  empty: { alignItems: "center", paddingTop: spacing.xxxl, gap: spacing.sm },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 16 },
  emptyBody: { color: colors.muted, fontSize: 12 },
  fab: {
    position: "absolute",
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  fabText: { color: colors.onBrand, fontWeight: "800", fontSize: 14 },
});
