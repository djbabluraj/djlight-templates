import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { listNotifications, listTemplates, TemplateMeta } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { getVideoPoster } from "@/src/utils/videoPoster";
import { AdBanner } from "@/src/ads/AdBanner";

type Filter = "all" | "free" | "premium";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "free", label: "Free" },
  { id: "premium", label: "Premium" },
];

const { width: SCREEN_W } = Dimensions.get("window");
const GRID_PAD = spacing.lg;
const CARD_W = SCREEN_W - GRID_PAD * 2;
// 16:9 (YouTube thumbnail) aspect ratio – wide, never cropped.
const THUMB_H = Math.round((CARD_W * 9) / 16);

const SEEN_NOTIFS_KEY_PREFIX = "djl_seen_notif:";

// Minimum length for a base64 string to be considered a "real" image —
// anything shorter is almost certainly a broken/empty upload, not an
// actual JPEG/PNG. Smallest valid 1×1 JPEG is ~600 chars, so 400 is a
// safe floor that still rejects test/corrupt data (e.g. 114-char stubs).
const MIN_THUMB_B64_LEN = 400;

function isUsableThumb(b64?: string | null): b64 is string {
  if (!b64) return false;
  // Strip the optional "data:image/..;base64," prefix before measuring.
  const payload = b64.startsWith("data:") ? b64.split(",", 2)[1] || "" : b64;
  return payload.length >= MIN_THUMB_B64_LEN;
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("all");
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [bannerTitle, setBannerTitle] = useState("");
  const lastIdsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async (silent = false) => {
    try {
      const list = await listTemplates();
      const incomingIds = new Set(list.map((t) => t.id));
      // Detect newly added templates and show in-app banner.
      if (lastIdsRef.current.size > 0) {
        const fresh = list.filter((t) => !lastIdsRef.current.has(t.id));
        if (fresh.length > 0) {
          setBannerTitle(`New: ${fresh[0].title} is now live`);
          setShowBanner(true);
          setTimeout(() => setShowBanner(false), 4500);
        }
      }
      lastIdsRef.current = incomingIds;
      setTemplates(list);
    } catch (e) {
      if (!silent) console.warn("load templates failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const checkNotifs = useCallback(async () => {
    try {
      const notifs = await listNotifications();
      if (notifs.length > 0) {
        const latest = notifs[0];
        const seenKey = SEEN_NOTIFS_KEY_PREFIX + latest.id;
        const { storage } = await import("@/src/utils/storage");
        const seen = await storage.getItem<boolean>(seenKey, false);
        if (!seen) {
          setBannerTitle(latest.body || latest.title);
          setShowBanner(true);
          await storage.setItem(seenKey, true);
          setTimeout(() => setShowBanner(false), 4500);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    load();
    checkNotifs();
    // Poll every 8s for real-time updates (Firestore equivalent on a Mongo backend).
    const id = setInterval(() => {
      load(true);
    }, 8000);
    return () => clearInterval(id);
  }, [load, checkNotifs]);

  const filtered = useMemo(() => {
    if (filter === "all") return templates;
    return templates.filter((t) => t.template_type === filter);
  }, [templates, filter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
    checkNotifs();
  }, [load, checkNotifs]);

  const renderItem = useCallback(
    ({ item, index }: { item: TemplateMeta; index: number }) => (
      <TemplateCard
        item={item}
        index={index}
        onPress={() => router.push(`/template/${item.id}`)}
      />
    ),
    [router]
  );

  return (
    <View style={styles.root} testID="home-screen">
      {/* Sticky glass header */}
      <View
        style={[
          styles.headerWrap,
          { paddingTop: insets.top + spacing.sm },
        ]}
      >
        <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.headerInner}>
          <View style={styles.headerTopRow}>
            <View style={styles.brandWrap}>
              <Image
                source={require("../../assets/images/header-logo.png")}
                style={styles.brandLogo}
                contentFit="contain"
              />
              <View>
                <Text style={styles.brandTitle}>DJ Light</Text>
                <Text style={styles.brandSub}>Templates</Text>
              </View>
            </View>
          </View>

          <View style={styles.filterRow}>
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <Pressable
                  key={f.id}
                  testID={`filter-${f.id}`}
                  onPress={() => setFilter(f.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                    ]}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
            <View style={{ flex: 1 }} />
            <View style={styles.countPill}>
              <Text style={styles.countText}>{filtered.length}</Text>
            </View>
          </View>
        </View>
      </View>

      {showBanner && (
        <Animated.View
          entering={FadeIn}
          style={[
            styles.notifBanner,
            { top: insets.top + 140 },
          ]}
          testID="notification-banner"
        >
          <Ionicons name="notifications" size={16} color={colors.onBrand} />
          <Text style={styles.notifText} numberOfLines={2}>
            {bannerTitle}
          </Text>
        </Animated.View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{
            paddingHorizontal: GRID_PAD,
            paddingTop: insets.top + 170,
            paddingBottom: insets.bottom + 100,
            gap: spacing.lg,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="albums-outline" size={36} color={colors.brand} />
              </View>
              <Text style={styles.emptyTitle}>No templates yet</Text>
              <Text style={styles.emptyBody}>
                New drops will land here. Pull down to refresh.
              </Text>
            </View>
          }
          ListFooterComponent={
            // AdMob banner anchored at the end of the library list. The
            // component is a no-op on web (renders null), so this is safe.
            <View testID="home-ad-banner" style={{ paddingTop: spacing.lg }}>
              <AdBanner />
            </View>
          }
        />
      )}
    </View>
  );
}

function TemplateCard({
  item,
  index,
  onPress,
}: {
  item: TemplateMeta;
  index: number;
  onPress: () => void;
}) {
  const isPremium = item.template_type === "premium";
  const isVideo =
    item.media_type === "video" &&
    !!(item.video_url || item.video_base64);
  const thumb = isUsableThumb(item.thumbnail_base64)
    ? toDataUri(item.thumbnail_base64)
    : undefined;

  // For video templates without a usable uploaded thumbnail, extract the
  // first frame from the video URL as the poster (a real image — never a
  // placeholder card).
  const [videoPoster, setVideoPoster] = useState<string | null>(null);
  const needsExtraction = isVideo && !thumb && !!item.video_url;

  useEffect(() => {
    if (!needsExtraction) return;
    let cancelled = false;
    getVideoPoster(item.video_url).then((uri) => {
      if (!cancelled) setVideoPoster(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [needsExtraction, item.video_url]);

  // Final source: uploaded thumb → extracted frame → branded default image.
  // We NEVER render the old purple "Tap to Preview" placeholder card.
  const displayThumb = thumb ?? videoPoster ?? undefined;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <Pressable
        onPress={onPress}
        testID={`template-card-${item.id}`}
        style={({ pressed }) => [
          styles.card,
          { transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
      >
        <View style={styles.thumbWrap}>
          {displayThumb ? (
            <Image
              source={{ uri: displayThumb }}
              style={styles.thumb}
              contentFit="cover"
              transition={300}
            />
          ) : (
            // Last-resort: no admin thumbnail AND first-frame extraction
            // failed / unavailable on this platform. We deliberately do
            // NOT render the app logo or a branded placeholder card here
            // — just a clean dark surface so the play overlay is the
            // single focal point.
            <View style={[styles.thumb, styles.thumbBlank]} />
          )}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.85)"]}
            style={styles.thumbScrim}
          />
          {isVideo && (
            // Subtle centered play badge on top of the still — universal
            // "tap to preview" affordance, kept above EVERY thumbnail
            // variant (real poster or extracted frame or blank).
            <View pointerEvents="none" style={styles.videoPlayBadge}>
              <View style={styles.videoPlayBadgeInner}>
                <Ionicons name="play" size={18} color={colors.onBrand} />
              </View>
            </View>
          )}
          {isVideo && (
            <View style={styles.videoTag}>
              <Ionicons name="play" size={9} color={colors.onBrand} />
              <Text style={styles.videoTagText}>VIDEO</Text>
            </View>
          )}
          <View
            style={[
              styles.badge,
              isPremium ? styles.badgePremium : styles.badgeFree,
            ]}
          >
            {isPremium ? (
              <Ionicons name="diamond" size={10} color={colors.onBrand} />
            ) : (
              <Ionicons name="checkmark-circle" size={10} color={colors.brand} />
            )}
            <Text
              style={[
                styles.badgeText,
                isPremium ? styles.badgeTextPremium : styles.badgeTextFree,
              ]}
            >
              {isPremium ? "PREMIUM" : "FREE"}
            </Text>
          </View>
          <Pressable
            onPress={onPress}
            style={styles.downloadIcon}
            testID={`card-download-${item.id}`}
            hitSlop={8}
          >
            <Ionicons name="arrow-down" size={16} color={colors.onBrand} />
          </Pressable>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardCategory} numberOfLines={1}>
            {item.category}
          </Text>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.cardMeta}>
            <Ionicons name="cloud-download-outline" size={11} color={colors.muted} />
            <Text style={styles.cardMetaText}>{item.downloads} downloads</Text>
            {isPremium && item.price > 0 && (
              <>
                <View style={styles.dot} />
                <Text style={styles.priceText}>${item.price.toFixed(2)}</Text>
              </>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function toDataUri(b64: string): string {
  if (b64.startsWith("data:")) return b64;
  return `data:image/jpeg;base64,${b64}`;
}

/** Re-export for other screens that read `thumbnail_base64`. */
export { isUsableThumb };

export function toVideoDataUri(b64: string): string {
  if (b64.startsWith("data:")) return b64;
  return `data:video/mp4;base64,${b64}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  headerWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: "rgba(10,10,10,0.6)",
  },
  headerInner: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
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
  badgeDot: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  brandWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  brandLogo: {
    width: 52,
    height: 52,
    borderRadius: 12,
  },
  brandTitle: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  brandSub: {
    color: "#d36bff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 3,
    textTransform: "uppercase",
    marginTop: 2,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: { color: colors.onBrand },
  countPill: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    width: CARD_W,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbWrap: { width: "100%", height: THUMB_H, position: "relative" },
  thumb: { width: "100%", height: "100%" },
  thumbBlank: {
    // Plain dark surface used only when no real image is available — no
    // logo, no placeholder graphics.
    backgroundColor: "#111114",
  },
  videoPlayBadge: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  videoPlayBadgeInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(196,251,109,0.92)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  thumbScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "55%",
  },
  badge: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeFree: {
    backgroundColor: "rgba(196,251,109,0.18)",
    borderWidth: 1,
    borderColor: colors.brand,
  },
  badgePremium: {
    backgroundColor: colors.brand,
  },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  badgeTextFree: { color: colors.brand },
  badgeTextPremium: { color: colors.onBrand },
  downloadIcon: {
    position: "absolute",
    bottom: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    padding: spacing.md,
    gap: 4,
  },
  cardCategory: {
    color: colors.brand,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  cardTitle: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "700",
  },
  videoTag: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  videoTagText: { fontSize: 8, fontWeight: "800", letterSpacing: 1, color: colors.onBrand },
  badgeShift: { top: spacing.sm + 28 },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardMetaText: { color: colors.muted, fontSize: 11 },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.muted,
    marginHorizontal: 6,
  },
  priceText: { color: colors.brand, fontSize: 11, fontWeight: "800" },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxxl,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: "800",
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    maxWidth: 260,
  },
  notifBanner: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notifText: {
    color: colors.onBrand,
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
});
