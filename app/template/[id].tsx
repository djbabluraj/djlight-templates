import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getTemplate, TemplateMeta, trackDownload } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import {
  DownloadEvent,
  downloadFileToDevice,
  hasSavedDownloadDir,
} from "@/src/utils/downloader";
import { resolveMediaUrl } from "@/src/utils/urls";
import { getVideoPoster } from "@/src/utils/videoPoster";

import { toDataUri, toVideoDataUri, isUsableThumb } from "../(tabs)";
import { AdBanner } from "@/src/ads/AdBanner";
import { recordSuccessfulDownload } from "@/src/ads/downloadAdGate";

export default function TemplateDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [template, setTemplate] = useState<TemplateMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<DownloadEvent["stage"] | null>(null);
  const [bytesLine, setBytesLine] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const cancelRef = useRef<{ aborted: boolean }>({ aborted: false });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const t = await getTemplate(String(id));
        if (mounted) setTemplate(t);
      } catch (e) {
        console.warn(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  // Decide where the preview video comes from:
  //  1. video_url  → preferred (streamable HTTP source, fast & reliable)
  //  2. video_base64 → fallback (legacy inline upload, may be flaky on Android)
  const isVideo =
    template?.media_type === "video" &&
    !!(template?.video_url || template?.video_base64);
  const videoSource = React.useMemo(() => {
    if (!isVideo || !template) return null;
    const url = (template.video_url || "").trim();
    if (url) return resolveMediaUrl(url);
    if (template.video_base64) return toVideoDataUri(template.video_base64);
    return null;
  }, [isVideo, template]);

  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  // `playing` toggles the YouTube-style "tap-to-play" experience: until the
  // user taps the big Play button we show the same poster thumbnail used on
  // the home grid. After tap we mount the VideoView with native controls.
  const [playing, setPlaying] = useState(false);
  // First-frame poster extracted from video_url when no thumbnail was set.
  const [extractedPoster, setExtractedPoster] = useState<string | null>(null);

  // Reset state when the source changes (different template).
  useEffect(() => {
    setVideoReady(false);
    setVideoError(null);
    setPlaying(false);
  }, [videoSource]);

  // Auto-extract first frame from video URL as poster when there's no
  // usable uploaded thumbnail. Matches the home grid behaviour so users see
  // a consistent preview before they tap Play.
  useEffect(() => {
    if (!isVideo) return;
    if (isUsableThumb(template?.thumbnail_base64)) return;
    if (!template?.video_url) return;
    let cancelled = false;
    getVideoPoster(template.video_url).then((uri) => {
      if (!cancelled) setExtractedPoster(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [isVideo, template?.thumbnail_base64, template?.video_url]);

  const player = useVideoPlayer(videoSource, (p) => {
    if (!videoSource) return;
    p.loop = true;
    p.muted = false;
    // Don't autoplay — the user explicitly taps the Play button.
  });

  // Observe player status — drives the loading spinner & error fallback.
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener("statusChange", (e: any) => {
      const status = e?.status ?? e;
      if (status === "readyToPlay") {
        setVideoReady(true);
        setVideoError(null);
      } else if (status === "error") {
        setVideoError(
          e?.error?.message ||
            "Couldn't load the video preview. Check the URL or try downloading the file directly.",
        );
      } else if (status === "loading") {
        setVideoReady(false);
      }
    });
    return () => sub?.remove?.();
  }, [player]);

  const handlePlayPress = useCallback(() => {
    if (!isVideo || !player) return;
    setPlaying(true);
    setVideoError(null);
    try {
      player.play();
    } catch {
      /* status listener will surface any error */
    }
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
  }, [isVideo, player]);

  const startDownload = useCallback(async () => {
    if (!template || downloading) return;
    const link = template.download_link?.trim();
    if (!link) {
      setErrorMsg("No download link is configured for this template.");
      return;
    }

    cancelRef.current = { aborted: false };
    setDownloading(true);
    setProgress(0);
    setStage("preparing");
    setBytesLine(null);
    setDoneMsg(null);
    setErrorMsg(null);

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    try {
      trackDownload(template.id).catch(() => {});

      const res = await downloadFileToDevice({
        url: link,
        suggestedName: template.title,
        defaultExtension: "viz",
        signal: cancelRef.current,
        onEvent: (e) => {
          setStage(e.stage);
          setProgress(e.progress);
          if (e.bytesWritten != null && e.totalBytes) {
            setBytesLine(
              `${formatBytes(e.bytesWritten)} / ${formatBytes(e.totalBytes)}`,
            );
          } else if (e.bytesWritten != null) {
            setBytesLine(formatBytes(e.bytesWritten));
          }
          if (e.message && (e.stage === "saving" || e.stage === "preparing")) {
            setDoneMsg(e.message);
          }
        },
      });

      setProgress(1);
      setStage("complete");
      setDoneMsg(
        res.savedToDownloads
          ? `Saved “${res.fileName}” to your Downloads folder ✓`
          : `Saved “${res.fileName}” to ${res.folderLabel} ✓`,
      );
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {},
        );
      }

      // AdMob: count this success toward the interstitial cadence.
      // Fires-and-forgets — never blocks the post-download UI.
      recordSuccessfulDownload().catch(() => {});
    } catch (e: any) {
      const msg = e?.message || "Download failed";
      if (/cancel/i.test(msg)) {
        setStage("cancelled");
        setErrorMsg("Download cancelled.");
      } else if (e?.name === "PermissionDeniedError" || /folder/i.test(msg)) {
        setStage("error");
        setErrorMsg(msg);
      } else {
        setStage("error");
        setErrorMsg(msg);
      }
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
          () => {},
        );
      }
    } finally {
      setTimeout(() => setDownloading(false), 900);
    }
  }, [template, downloading]);

  /**
   * On Android, the first time the user taps Download we show a friendly
   * explainer Alert. The next screen is Android's folder picker — the user
   * needs to tap "USE THIS FOLDER" once Downloads is selected. This dialog
   * eliminates the confusion that caused the "preview screen" report.
   */
  const handleDownload = useCallback(async () => {
    if (!template || downloading) return;

    if (Platform.OS === "android") {
      const alreadyPicked = await hasSavedDownloadDir().catch(() => false);
      if (!alreadyPicked) {
        Alert.alert(
          "Choose a folder to save your downloads",
          "Android needs your permission to write into a folder. We'll open the folder picker — select your Downloads folder and tap “USE THIS FOLDER”. We'll remember it from now on.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Continue", style: "default", onPress: () => startDownload() },
          ],
          { cancelable: true },
        );
        return;
      }
    }
    startDownload();
  }, [template, downloading, startDownload]);

  const handleCancel = useCallback(() => {
    cancelRef.current.aborted = true;
  }, []);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  if (!template) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.errTitle}>Template not found</Text>
        <Pressable style={styles.btn} onPress={() => router.back()}>
          <Text style={styles.btnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const isPremium = template.template_type === "premium";

  return (
    <View style={styles.root} testID="template-detail">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — proper 16:9 preview card that mirrors the home thumbnail.
            Default state: same poster the user saw in the grid, with a large
            tap-to-play button. After tap, the VideoView mounts with native
            controls (play/pause/seek/fullscreen). */}
        <View style={[styles.heroSlot, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            testID="detail-back"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>

          <View style={styles.hero}>
            {/* Static poster layer — always a real image. Mirrors what the
                user sees on the home grid. Order:
                  1. Uploaded thumbnail_base64 (admin-set)
                  2. First-frame extracted from video_url (real frame)
                  3. Branded splash asset (real bundled image)
                Never a "Tap to Preview" placeholder card. */}
            {isUsableThumb(template.thumbnail_base64) ? (
              <Image
                source={{ uri: toDataUri(template.thumbnail_base64) }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={300}
              />
            ) : isVideo && extractedPoster ? (
              <Image
                source={{ uri: extractedPoster }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={300}
              />
            ) : (
              // Last-resort: no admin thumbnail AND no extracted frame.
              // Clean dark surface — never the app logo.
              <View style={[StyleSheet.absoluteFill, styles.heroBlank]} />
            )}

            {/* Mounted VideoView — only after the user taps Play. Keeps the
                video decoder cold for image-only templates and prevents the
                "background banner" look the user reported. */}
            {isVideo && playing && (
              <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                nativeControls
                allowsFullscreen
                allowsPictureInPicture={false}
              />
            )}

            {/* Tap-to-play overlay — big circular play button. */}
            {isVideo && !playing && (
              <>
                <View style={styles.heroDim} pointerEvents="none" />
                <Pressable
                  onPress={handlePlayPress}
                  style={styles.playHit}
                  testID="hero-play-button"
                  hitSlop={8}
                  android_ripple={{
                    color: "rgba(196,251,109,0.18)",
                    borderless: true,
                  }}
                >
                  <View style={styles.playButton}>
                    <Ionicons
                      name="play"
                      size={32}
                      color={colors.onBrand}
                      style={{ marginLeft: 3 }}
                    />
                  </View>
                  <Text style={styles.playLabel}>Tap to preview</Text>
                </Pressable>
              </>
            )}

            {/* Loading & error overlays appear after the user has hit play. */}
            {isVideo && playing && !videoReady && !videoError && (
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, styles.videoLoading]}
              >
                <View style={styles.videoLoadingBubble}>
                  <ActivityIndicator color={colors.brand} />
                  <Text style={styles.videoLoadingText}>Loading preview…</Text>
                </View>
              </View>
            )}
            {isVideo && playing && videoError && (
              <View style={[StyleSheet.absoluteFill, styles.videoLoading]}>
                <View style={styles.videoErrorBubble}>
                  <Ionicons name="alert-circle" size={18} color="#ff8a8a" />
                  <Text style={styles.videoErrorText} numberOfLines={3}>
                    {videoError}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setPlaying(false);
                    setVideoError(null);
                  }}
                  style={styles.videoErrorRetry}
                  hitSlop={8}
                >
                  <Text style={styles.videoErrorRetryText}>Dismiss</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Title row (moved out of the hero so the 16:9 frame stays clean) */}
        <View style={styles.titleBlock}>
          <View style={styles.heroRow}>
            <Text style={styles.heroCategory}>{template.category}</Text>
            <View
              style={[
                styles.badge,
                isPremium ? styles.badgePremium : styles.badgeFree,
              ]}
            >
              {isPremium ? (
                <Ionicons name="diamond" size={11} color={colors.onBrand} />
              ) : (
                <Ionicons name="checkmark-circle" size={11} color={colors.brand} />
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
          </View>
          <Text style={styles.heroTitle}>{template.title}</Text>
        </View>

        {/* Stat strip */}
        <View style={styles.statRow}>
          <StatCell
            icon="cloud-download-outline"
            label="Downloads"
            value={String(template.downloads)}
          />
          <View style={styles.statDivider} />
          <StatCell
            icon={isVideo ? "videocam-outline" : "image-outline"}
            label="Preview"
            value={isVideo ? "Video" : "Image"}
          />
          <View style={styles.statDivider} />
          <StatCell
            icon={isPremium ? "diamond-outline" : "pricetag-outline"}
            label={isPremium ? "Price" : "Type"}
            value={isPremium ? `$${template.price.toFixed(2)}` : "Free"}
          />
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ABOUT THIS TEMPLATE</Text>
          <Text style={styles.description}>
            {template.description?.trim() ||
              `${template.title} — high-quality ${isPremium ? "premium" : "free"} ${template.category} template. Tap download to save the file directly to your device.`}
          </Text>
        </View>

        {/* Download details card */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DOWNLOAD</Text>
          <View style={styles.infoCard}>
            <Ionicons
              name="cloud-download"
              size={22}
              color={colors.brand}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={1}>
                {Platform.OS === "android"
                  ? "Saves to your chosen folder"
                  : "Saves via Files / Share"}
              </Text>
              <Text style={styles.fileSub} numberOfLines={3}>
                {Platform.OS === "android"
                  ? "First time you'll pick a folder (Downloads is recommended). Tap “USE THIS FOLDER” when prompted — every download after that saves there silently."
                  : "We'll show the share sheet so you can save it to Files or any app."}
              </Text>
            </View>
          </View>
        </View>

        {/* AdMob banner at the end of the detail-screen scroll. Returns null
            on web. Anchored above the sticky download CTA so it never
            covers actionable UI. */}
        <View testID="detail-ad-banner" style={{ marginTop: spacing.md }}>
          <AdBanner />
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View
        style={[
          styles.ctaWrap,
          { paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <LinearGradient
          colors={["transparent", colors.surface]}
          style={styles.ctaScrim}
          pointerEvents="none"
        />
        {downloading && (
          <Animated.View entering={FadeIn} style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle} numberOfLines={1}>
                {stageLabel(stage)}
              </Text>
              <Text style={styles.progressPct}>
                {Math.round(progress * 100)}%
              </Text>
            </View>
            <View style={styles.progressWrap}>
              <View
                style={[
                  styles.progressBar,
                  { width: `${Math.max(4, Math.round(progress * 100))}%` },
                ]}
              />
            </View>
            <View style={styles.progressFooter}>
              <Text style={styles.progressSub} numberOfLines={1}>
                {bytesLine || (stage === "saving" ? "Writing to Downloads…" : "")}
              </Text>
              {stage === "downloading" && (
                <Pressable
                  onPress={handleCancel}
                  hitSlop={8}
                  testID="download-cancel"
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              )}
            </View>
          </Animated.View>
        )}
        {doneMsg && !downloading && (
          <Animated.View entering={FadeIn} style={styles.doneToast}>
            <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
            <Text style={styles.doneText} numberOfLines={2}>
              {doneMsg}
            </Text>
          </Animated.View>
        )}
        {errorMsg && !downloading && (
          <Animated.View entering={FadeIn} style={styles.errorToast}>
            <Ionicons name="alert-circle" size={16} color="#ff8a8a" />
            <Text style={styles.errorText} numberOfLines={3}>
              {errorMsg}
            </Text>
          </Animated.View>
        )}
        <Pressable
          onPress={handleDownload}
          disabled={downloading}
          style={({ pressed }) => [
            styles.cta,
            { transform: [{ scale: pressed ? 0.98 : 1 }] },
            downloading && { opacity: 0.75 },
          ]}
          testID="download-button"
        >
          {downloading ? (
            <>
              <ActivityIndicator size="small" color={colors.onBrand} />
              <Text style={styles.ctaText}>
                {stage === "saving" ? "Saving…" : "Downloading…"}
              </Text>
            </>
          ) : (
            <>
              <Ionicons
                name="arrow-down-circle"
                size={20}
                color={colors.onBrand}
              />
              <Text style={styles.ctaText}>
                {isPremium
                  ? `Get Premium · $${template.price.toFixed(2)}`
                  : "Download Template"}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function stageLabel(stage: DownloadEvent["stage"] | null): string {
  switch (stage) {
    case "asking-folder":
      return "Pick a folder to save to…";
    case "preparing":
      return "Preparing download…";
    case "downloading":
      return "Downloading template";
    case "saving":
      return "Saving to your folder…";
    case "complete":
      return "Download complete";
    case "cancelled":
      return "Download cancelled";
    case "error":
      return "Download failed";
    default:
      return "Working…";
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function StatCell({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statCell}>
      <Ionicons name={icon} size={16} color={colors.brand} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  errTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700" },
  btn: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  btnText: { color: colors.onBrand, fontWeight: "800" },
  hero: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#0a0a0a",
    overflow: "hidden",
    position: "relative",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroSlot: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  heroDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  heroBlank: {
    backgroundColor: "#111114",
  },
  playHit: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  playLabel: {
    color: colors.onSurface,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
    backgroundColor: "rgba(10,10,10,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  videoErrorRetry: {
    position: "absolute",
    bottom: 12,
    backgroundColor: "rgba(10,10,10,0.85)",
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  videoErrorRetryText: {
    color: colors.onSurface,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1,
  },
  titleBlock: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
  },
  videoLoading: {
    alignItems: "center",
    justifyContent: "center",
  },
  videoLoadingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(10,10,10,0.78)",
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  videoLoadingText: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: "700",
  },
  videoErrorBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(10,10,10,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,138,138,0.5)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    maxWidth: "85%",
  },
  videoErrorText: {
    color: "#ffd0d0",
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  backBtn: {
    alignSelf: "flex-start",
    marginBottom: spacing.sm,
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroFooter: {
    gap: spacing.sm,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroCategory: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  badgeFree: {
    backgroundColor: "rgba(196,251,109,0.18)",
    borderWidth: 1,
    borderColor: colors.brand,
  },
  badgePremium: { backgroundColor: colors.brand },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  badgeTextFree: { color: colors.brand },
  badgeTextPremium: { color: colors.onBrand },
  heroTitle: {
    color: colors.onSurface,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  statRow: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  statCell: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  statLabel: {
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "700",
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.divider,
  },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.sm },
  sectionLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
  },
  description: {
    color: colors.onSurfaceSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fileName: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  fileSub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  ctaWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  ctaScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -40,
    height: 40,
  },
  progressCard: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressTitle: {
    color: colors.onSurface,
    fontWeight: "700",
    fontSize: 13,
    flex: 1,
  },
  progressPct: {
    color: colors.brand,
    fontWeight: "800",
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  progressWrap: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
  },
  progressBar: { height: "100%", backgroundColor: colors.brand },
  progressFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressSub: {
    color: colors.muted,
    fontSize: 11,
    flex: 1,
    fontVariant: ["tabular-nums"],
  },
  cancelText: {
    color: colors.brand,
    fontWeight: "800",
    fontSize: 12,
    paddingLeft: spacing.sm,
  },
  doneToast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(196,251,109,0.10)",
    borderWidth: 1,
    borderColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  doneText: { color: colors.onSurface, fontSize: 12, flex: 1, fontWeight: "600" },
  errorToast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,138,138,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,138,138,0.4)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  errorText: { color: "#ffd0d0", fontSize: 12, flex: 1, fontWeight: "600" },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    paddingVertical: spacing.md + 4,
    borderRadius: radius.pill,
  },
  ctaText: { color: colors.onBrand, fontSize: 15, fontWeight: "800" },
});
