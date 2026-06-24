// Extracts the first-frame poster from a remote video URL using
// `expo-video-thumbnails`. Results are cached on-device so we do
// not regenerate the frame on every render (and the file URI we
// return is persistent inside the app's cache dir).
//
// Notes:
//  - Web platform has no native decoder available; we short-circuit
//    and return null so the UI shows the branded fallback poster.
//  - We swallow errors (e.g. CORS / unsupported codec) and let the
//    caller render the branded fallback in those cases.

import { Platform } from "react-native";
import * as VideoThumbnails from "expo-video-thumbnails";

import { storage } from "@/src/utils/storage";
import { resolveMediaUrl } from "@/src/utils/urls";

const CACHE_PREFIX = "djl_video_poster:";

// In-memory de-dupe so we don't kick off multiple extractions for the
// same URL while the first one is in flight (FlatList recycles cards).
const inflight = new Map<string, Promise<string | null>>();

export async function getVideoPoster(videoUrl: string): Promise<string | null> {
  if (!videoUrl) return null;
  if (Platform.OS === "web") return null; // no decoder available in preview

  const resolved = resolveMediaUrl(videoUrl);
  const key = CACHE_PREFIX + resolved;

  // 1. Try cache first.
  const cached = await storage.getItem<string>(key, "");
  if (cached && typeof cached === "string" && cached.length > 0) {
    return cached;
  }

  // 2. Coalesce concurrent calls.
  const existing = inflight.get(resolved);
  if (existing) return existing;

  const job = (async () => {
    try {
      // Try a few timestamps in case the very first frame is black.
      const candidates = [1000, 250, 0, 2000];
      for (const time of candidates) {
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(resolved, {
            time,
            quality: 0.7,
          });
          if (uri) {
            await storage.setItem(key, uri);
            return uri;
          }
        } catch {
          // try next timestamp
        }
      }
      return null;
    } catch (e) {
      console.warn("[videoPoster] extraction failed", e);
      return null;
    } finally {
      inflight.delete(resolved);
    }
  })();

  inflight.set(resolved, job);
  return job;
}

/** Optional: clear all poster cache entries (used when admin re-uploads). */
export async function clearVideoPosterCache(videoUrl?: string): Promise<void> {
  if (videoUrl) {
    await storage.removeItem(CACHE_PREFIX + resolveMediaUrl(videoUrl));
    return;
  }
  // No bulk clear API on storage — caller should pass a URL.
}
