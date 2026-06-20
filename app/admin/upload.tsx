import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useMemo, useState } from "react";
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

import {
  adminCreateTemplate,
  adminUpdateTemplate,
  getTemplate,
  MediaType,
  TemplateType,
} from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";
import { isHttpUrl, resolveMediaUrl } from "@/src/utils/urls";

type Picked = {
  base64: string;        // raw or data URI
  previewUri?: string;
  size?: number;
};

const MAX_VIDEO_MB = 8;

export default function AdminUpload() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("AV Player Template");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TemplateType>("free");
  const [price, setPrice] = useState("");
  const [downloadLink, setDownloadLink] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [thumb, setThumb] = useState<Picked | null>(null);
  const [video, setVideo] = useState<Picked | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [bootLoading, setBootLoading] = useState(isEdit);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Hydrate when editing
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const t = await getTemplate(String(id));
        setTitle(t.title);
        setCategory(t.category || "AV Player Template");
        setDescription(t.description || "");
        setType(t.template_type);
        setPrice(t.price > 0 ? String(t.price) : "");
        setDownloadLink(t.download_link || "");
        setMediaType(t.media_type);
        if (t.media_type === "image" && t.thumbnail_base64) {
          setThumb({ base64: t.thumbnail_base64, previewUri: t.thumbnail_base64 });
        }
        if (t.media_type === "video") {
          // Thumbnail can exist on video templates as a poster.
          if (t.thumbnail_base64) {
            setThumb({
              base64: t.thumbnail_base64,
              previewUri: t.thumbnail_base64,
            });
          }
          if (t.video_url) setVideoUrl(t.video_url);
          if (t.video_base64) setVideo({ base64: t.video_base64 });
        }
      } catch (e: any) {
        setErr(e?.message || "Failed to load template");
      } finally {
        setBootLoading(false);
      }
    })();
  }, [id, isEdit]);

  // Preview source: prefer pasted URL, fall back to base64 file.
  const videoSrc = useMemo(() => {
    const url = videoUrl.trim();
    if (url && isHttpUrl(url)) return resolveMediaUrl(url);
    if (video?.base64) {
      return video.base64.startsWith("data:")
        ? video.base64
        : `data:video/mp4;base64,${video.base64}`;
    }
    return null;
  }, [videoUrl, video]);
  const player = useVideoPlayer(videoSrc, (p) => {
    if (!videoSrc) return;
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const pickThumbnail = async () => {
    setErr(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErr("Media library permission denied");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
        allowsEditing: true,
        aspect: [16, 9],
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      let base64 = a.base64 || "";
      if (!base64 && a.uri) {
        base64 = await FileSystem.readAsStringAsync(a.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      setThumb({
        base64: `data:${a.mimeType || "image/jpeg"};base64,${base64}`,
        previewUri: a.uri,
        size: a.fileSize,
      });
    } catch (e: any) {
      setErr(`Pick failed: ${e?.message || "unknown"}`);
    }
  };

  const pickVideo = async () => {
    setErr(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErr("Media library permission denied");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        videoMaxDuration: 30,
        quality: 0.5,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const sizeMB = (a.fileSize || 0) / (1024 * 1024);
      if (sizeMB > MAX_VIDEO_MB) {
        setErr(`Video too large (${sizeMB.toFixed(1)}MB). Max ${MAX_VIDEO_MB}MB.`);
        return;
      }
      const b64 = await FileSystem.readAsStringAsync(a.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setVideo({
        base64: `data:${a.mimeType || "video/mp4"};base64,${b64}`,
        previewUri: a.uri,
        size: a.fileSize,
      });
    } catch (e: any) {
      setErr(`Pick failed: ${e?.message || "unknown"}`);
    }
  };

  const switchMediaType = (next: MediaType) => {
    setMediaType(next);
    // Switching to image clears video sources, but thumbnail is kept either way.
    if (next === "image") {
      setVideo(null);
      setVideoUrl("");
    }
  };

  const submit = async () => {
    setErr(null);
    setOkMsg(null);
    if (!title.trim()) return setErr("Title is required");
    if (!category.trim()) return setErr("Category is required");
    if (!downloadLink.trim()) return setErr("Download link is required");
    if (mediaType === "image" && !thumb) return setErr("Pick a thumbnail image");
    if (mediaType === "video") {
      const trimmedUrl = videoUrl.trim();
      const hasUrl = !!trimmedUrl;
      const hasFile = !!video;
      if (!hasUrl && !hasFile) {
        return setErr("Paste a video URL or pick a video file");
      }
      if (hasUrl && !isHttpUrl(trimmedUrl)) {
        return setErr("Video URL must start with http:// or https://");
      }
    }
    if (type === "premium" && (!price || isNaN(Number(price)) || Number(price) <= 0)) {
      return setErr("Enter a valid premium price");
    }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        category: category.trim(),
        template_type: type,
        price: type === "premium" ? Number(price) : 0,
        description: description.trim(),
        download_link: downloadLink.trim(),
        media_type: mediaType,
        // Thumbnail (or poster, for video templates): always send if present.
        thumbnail_base64: thumb ? thumb.base64 : "",
        video_base64:
          mediaType === "video" && video && !videoUrl.trim() ? video.base64 : "",
        video_url: mediaType === "video" ? videoUrl.trim() : "",
      };

      if (isEdit) {
        await adminUpdateTemplate(String(id), payload);
        setOkMsg("Template updated. Returning to dashboard…");
      } else {
        await adminCreateTemplate(payload);
        setOkMsg("Published! Returning to dashboard…");
      }
      setTimeout(() => router.back(), 800);
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (bootLoading) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {isEdit ? "Edit Template" : "New Template"}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + 120,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Preview media-type toggle */}
        <Text style={styles.label}>PREVIEW MEDIA</Text>
        <View style={styles.segment}>
          {(["image", "video"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => switchMediaType(m)}
              style={[styles.segmentBtn, mediaType === m && styles.segmentActive]}
              testID={`upload-media-${m}`}
            >
              <Ionicons
                name={m === "image" ? "image-outline" : "videocam-outline"}
                size={14}
                color={mediaType === m ? colors.onBrand : colors.onSurfaceSecondary}
              />
              <Text
                style={[
                  styles.segmentText,
                  mediaType === m && { color: colors.onBrand },
                ]}
              >
                {m === "image" ? "IMAGE" : "VIDEO"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.helper}>
          {mediaType === "image"
            ? "Upload a 16:9 image used as the grid thumbnail and detail hero."
            : "Paste a video URL (recommended) or pick a short file. The thumbnail below is shown as a poster while the video loads."}
        </Text>

        {/* Image-only thumbnail picker, OR Video poster picker for video templates */}
        {mediaType === "image" ? (
          <Pressable
            onPress={pickThumbnail}
            style={styles.mediaBox}
            testID="upload-pick-thumb"
          >
            {thumb ? (
              <Image
                source={{ uri: thumb.previewUri || thumb.base64 }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <View style={styles.mediaEmpty}>
                <Ionicons name="image-outline" size={28} color={colors.brand} />
                <Text style={styles.mediaHint}>Tap to pick a 16:9 thumbnail</Text>
              </View>
            )}
            {thumb && <ChangeOverlay />}
          </Pressable>
        ) : (
          <>
            {/* Video URL — preferred for reliability and streaming */}
            <Text style={[styles.label, { marginTop: spacing.md }]}>
              VIDEO URL (RECOMMENDED)
            </Text>
            <View style={styles.inputWrap}>
              <Ionicons name="link-outline" size={16} color={colors.muted} />
              <TextInput
                value={videoUrl}
                onChangeText={setVideoUrl}
                placeholder="https://drive.google.com/... or https://.../preview.mp4"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                keyboardType="url"
                style={styles.input}
                testID="upload-video-url"
              />
            </View>

            {/* Video player preview (only when there is some source) */}
            {videoSrc ? (
              <View style={styles.mediaBox}>
                <VideoView
                  player={player}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  nativeControls
                />
              </View>
            ) : (
              <Pressable
                onPress={pickVideo}
                style={styles.mediaBox}
                testID="upload-pick-video"
              >
                <View style={styles.mediaEmpty}>
                  <Ionicons
                    name="videocam-outline"
                    size={28}
                    color={colors.brand}
                  />
                  <Text style={styles.mediaHint}>
                    No preview yet. Paste a URL above, or tap to upload a short
                    file ({"≤"} {MAX_VIDEO_MB}MB).
                  </Text>
                </View>
              </Pressable>
            )}

            {/* Optional poster thumbnail for video templates */}
            <Text style={[styles.label, { marginTop: spacing.lg }]}>
              POSTER IMAGE (OPTIONAL)
            </Text>
            <Pressable
              onPress={pickThumbnail}
              style={[styles.mediaBox, { aspectRatio: 16 / 9 }]}
              testID="upload-pick-video-poster"
            >
              {thumb ? (
                <Image
                  source={{ uri: thumb.previewUri || thumb.base64 }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.mediaEmpty}>
                  <Ionicons name="image-outline" size={24} color={colors.brand} />
                  <Text style={styles.mediaHint}>
                    Tap to add a 16:9 poster shown in the grid
                  </Text>
                </View>
              )}
              {thumb && <ChangeOverlay />}
            </Pressable>
          </>
        )}

        {/* Title */}
        <Text style={styles.label}>TITLE</Text>
        <View style={styles.inputWrap}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Neon Pulse Avee Pack 01"
            placeholderTextColor={colors.muted}
            style={styles.input}
            testID="upload-title"
          />
        </View>

        {/* Category */}
        <Text style={styles.label}>CATEGORY</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="albums-outline" size={16} color={colors.muted} />
          <TextInput
            value={category}
            onChangeText={setCategory}
            placeholder="AV Player Template"
            placeholderTextColor={colors.muted}
            style={styles.input}
            testID="upload-category"
          />
        </View>

        {/* Description */}
        <Text style={styles.label}>DESCRIPTION (OPTIONAL)</Text>
        <View style={[styles.inputWrap, { height: 90 }]}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Brief description..."
            placeholderTextColor={colors.muted}
            multiline
            style={[styles.input, { textAlignVertical: "top", height: 90 }]}
            testID="upload-description"
          />
        </View>

        {/* Type */}
        <Text style={styles.label}>TYPE</Text>
        <View style={styles.segment}>
          {(["free", "premium"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={[styles.segmentBtn, type === t && styles.segmentActive]}
              testID={`upload-type-${t}`}
            >
              <Ionicons
                name={t === "free" ? "gift-outline" : "diamond-outline"}
                size={14}
                color={type === t ? colors.onBrand : colors.onSurfaceSecondary}
              />
              <Text
                style={[
                  styles.segmentText,
                  type === t && { color: colors.onBrand },
                ]}
              >
                {t.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Price */}
        {type === "premium" && (
          <>
            <Text style={styles.label}>PRICE (USD)</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="pricetag-outline" size={16} color={colors.muted} />
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="2.99"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                style={styles.input}
                testID="upload-price"
              />
            </View>
          </>
        )}

        {/* Download Link */}
        <Text style={styles.label}>DOWNLOAD LINK</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="link-outline" size={16} color={colors.muted} />
          <TextInput
            value={downloadLink}
            onChangeText={setDownloadLink}
            placeholder="https://drive.google.com/file/..."
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="url"
            style={styles.input}
            testID="upload-download-link"
          />
        </View>

        {err && (
          <View style={styles.errBox} testID="upload-error">
            <Ionicons name="alert-circle" size={14} color={colors.error} />
            <Text style={styles.errText}>{err}</Text>
          </View>
        )}
        {okMsg && (
          <View style={styles.okBox} testID="upload-success">
            <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
            <Text style={styles.okText}>{okMsg}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable
          onPress={submit}
          disabled={busy}
          style={({ pressed }) => [
            styles.cta,
            { transform: [{ scale: pressed ? 0.98 : 1 }] },
            busy && { opacity: 0.75 },
          ]}
          testID="upload-submit"
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.onBrand} />
          ) : (
            <>
              <Ionicons
                name={isEdit ? "save-outline" : "rocket"}
                size={18}
                color={colors.onBrand}
              />
              <Text style={styles.ctaText}>
                {isEdit ? "Save Changes" : "Publish Instantly"}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function ChangeOverlay() {
  return (
    <View style={styles.changeOverlay}>
      <Ionicons name="create-outline" size={14} color={colors.onBrand} />
      <Text style={styles.changeText}>Change</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
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
  label: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  helper: { color: colors.muted, fontSize: 11, marginTop: spacing.sm },
  mediaBox: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  mediaEmpty: { alignItems: "center", gap: 6, padding: spacing.lg },
  mediaHint: { color: colors.muted, fontSize: 12, textAlign: "center" },
  changeOverlay: {
    position: "absolute",
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  changeText: { color: colors.onBrand, fontSize: 10, fontWeight: "800" },
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
  input: { flex: 1, color: colors.onSurface, paddingVertical: 12, fontSize: 14 },
  segment: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
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
    marginTop: spacing.md,
  },
  errText: { color: colors.error, fontSize: 12, flex: 1 },
  okBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brand,
    marginTop: spacing.md,
  },
  okText: { color: colors.brand, fontSize: 12, flex: 1, fontWeight: "700" },
  ctaWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: "rgba(10,10,10,0.92)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
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
