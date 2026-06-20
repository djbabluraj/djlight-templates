// Native-side downloader for DJ Light Templates.
//
// Flow on Android (the primary target):
//   1. ENSURE we have a destination folder via the Storage Access Framework.
//      We ask BEFORE the download begins so the user understands what's
//      happening. The picker is pre-targeted to the system Downloads folder.
//      The granted folder URI is cached, so the prompt only appears once.
//   2. Stream the file to the app cache using expo-file-system's
//      `createDownloadResumable` — real byte-level progress.
//   3. Handle Google Drive "confirm token" pages (returned for large files).
//   4. Reject HTML error pages so we don't silently save a 1 KB junk file.
//   5. Persist the cached file into the user's chosen folder via SAF.
//
// On iOS we keep the existing share-sheet flow ("Save to Files").
// On web we hand off to the browser via Linking.openURL.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Linking, Platform } from "react-native";

import { resolveMediaUrl } from "./urls";

const SAF_DIR_KEY = "@djlights/saf-download-dir-uri";

export type DownloadStage =
  | "asking-folder"
  | "preparing"
  | "downloading"
  | "saving"
  | "complete"
  | "cancelled"
  | "error";

export type DownloadEvent = {
  stage: DownloadStage;
  /** 0..1 — only meaningful during `downloading` / `saving` */
  progress: number;
  uri?: string;
  fileName?: string;
  /** Human-readable folder location ("Downloads", "Files app", etc.) */
  folderLabel?: string;
  bytesWritten?: number;
  totalBytes?: number;
  message?: string;
  error?: string;
};

export type DownloadOptions = {
  url: string;
  suggestedName?: string;
  defaultExtension?: string;
  onEvent?: (e: DownloadEvent) => void;
  signal?: { aborted: boolean };
  /**
   * When set, ensures the destination folder is granted BEFORE the network
   * download begins. If the user denies, throws `PermissionDeniedError`.
   * Defaults to true on Android.
   */
  preflightFolderPermission?: boolean;
};

export type DownloadResult = {
  uri: string;
  fileName: string;
  bytes: number;
  savedToDownloads: boolean;
  /** Human-readable folder label, e.g. "Downloads". */
  folderLabel: string;
};

export class PermissionDeniedError extends Error {
  constructor(msg = "Folder permission denied") {
    super(msg);
    this.name = "PermissionDeniedError";
  }
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Convert Google Drive share/view URLs to direct-download URLs.
 * @deprecated Use `resolveMediaUrl` from `./urls` for new code.
 */
export function resolveDownloadUrl(input: string): string {
  return resolveMediaUrl(input);
}

function isDriveUrl(url: string): boolean {
  return /https?:\/\/(?:drive|docs)\.google\.com\//.test(url);
}

function extractDriveId(url: string): string | null {
  const m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m?.[1] ?? null;
}

/**
 * When Google Drive serves a large file, the first request returns an HTML
 * "virus scan" warning page with a download confirmation token. Detect that
 * and construct the bypass URL.
 *
 * Modern Drive uses the host `drive.usercontent.google.com` for the actual
 * file, so we hit that with the confirm token.
 */
async function maybeResolveDriveConfirmUrl(
  url: string,
  htmlBody: string,
): Promise<string | null> {
  if (!isDriveUrl(url)) return null;
  const id = extractDriveId(url);
  if (!id) return null;

  // Extract a confirm token if present anywhere on the page.
  // Examples:
  //   confirm=t-1234abcdef
  //   "confirm":"t-1234"
  //   name="confirm" value="t-1234"
  const tokenMatch =
    htmlBody.match(/confirm=([0-9A-Za-z_-]+)/) ||
    htmlBody.match(/"confirm":"([0-9A-Za-z_-]+)"/) ||
    htmlBody.match(/name="confirm"\s+value="([0-9A-Za-z_-]+)"/);
  const token = tokenMatch?.[1];
  if (!token) return null;

  return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=${token}`;
}

// ---------------------------------------------------------------------------
// Filename / MIME helpers
// ---------------------------------------------------------------------------

function sanitize(name: string): string {
  return name.replace(/[\/\\:*?"<>|\x00-\x1F]/g, "_").slice(0, 120);
}

export function inferFileName(
  url: string,
  suggested?: string,
  defaultExt = "viz",
): string {
  if (suggested && suggested.trim()) {
    const s = sanitize(suggested.trim());
    return /\.[a-z0-9]{1,8}$/i.test(s) ? s : `${s}.${defaultExt}`;
  }
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last && /\.[a-z0-9]{1,8}$/i.test(last)) return sanitize(last);
  } catch {
    /* not parseable */
  }
  return `download.${defaultExt}`;
}

function mimeForFile(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "mp3":
      return "audio/mpeg";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "zip":
      return "application/zip";
    case "pdf":
      return "application/pdf";
    case "json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

// ---------------------------------------------------------------------------
// Storage Access Framework helpers (Android only)
// ---------------------------------------------------------------------------

async function readCachedSafDir(): Promise<string | null> {
  try {
    const uri = await AsyncStorage.getItem(SAF_DIR_KEY);
    if (!uri) return null;
    // Probe — if the permission was revoked or the URI is stale, this throws.
    await FS.StorageAccessFramework.readDirectoryAsync(uri);
    return uri;
  } catch {
    await AsyncStorage.removeItem(SAF_DIR_KEY).catch(() => {});
    return null;
  }
}

/**
 * Ensures the user has granted access to a destination folder.
 *
 * We pre-target the system Downloads folder via `getUriForDirectoryInRoot`
 * — on most Android versions this opens the folder picker already focused
 * on Downloads, so the user only needs to tap "Use this folder".
 */
export async function ensureSafDir(): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  const cached = await readCachedSafDir();
  if (cached) return cached;

  let initial: string | undefined;
  try {
    initial = FS.StorageAccessFramework.getUriForDirectoryInRoot("Download");
  } catch {
    initial = undefined;
  }

  const res = await FS.StorageAccessFramework.requestDirectoryPermissionsAsync(
    initial,
  );
  if (!res.granted || !res.directoryUri) return null;
  await AsyncStorage.setItem(SAF_DIR_KEY, res.directoryUri);
  return res.directoryUri;
}

/** Pretty label for the granted folder so users know where the file went. */
export async function getSavedFolderLabel(): Promise<string> {
  if (Platform.OS !== "android") return "Files app";
  const uri = await AsyncStorage.getItem(SAF_DIR_KEY).catch(() => null);
  if (!uri) return "your chosen folder";
  try {
    const decoded = decodeURIComponent(uri);
    // SAF URIs look like:
    //   content://com.android.externalstorage.documents/tree/primary%3ADownload
    const segs = decoded.split(/[:/]/).filter(Boolean);
    const tail = segs[segs.length - 1] || "";
    if (/^download$/i.test(tail)) return "Downloads";
    if (tail) return tail;
  } catch {
    /* ignore */
  }
  return "your chosen folder";
}

/** Forget the cached folder choice (used by "Change download folder"). */
export async function clearSavedDownloadDir(): Promise<void> {
  await AsyncStorage.removeItem(SAF_DIR_KEY).catch(() => {});
}

export async function hasSavedDownloadDir(): Promise<boolean> {
  const uri = await readCachedSafDir();
  return !!uri;
}

// ---------------------------------------------------------------------------
// Core download
// ---------------------------------------------------------------------------

/**
 * Download a file to the device. Reports progress via `onEvent`.
 *  - Android: writes into the user's chosen folder (typically Downloads) via SAF.
 *  - iOS:     downloads then presents the share sheet for "Save to Files".
 *  - Web:     hands off to the browser via Linking.openURL.
 */
export async function downloadFileToDevice(
  opts: DownloadOptions,
): Promise<DownloadResult> {
  const { onEvent, signal } = opts;
  let url = resolveDownloadUrl(opts.url);
  const fileName = inferFileName(url, opts.suggestedName, opts.defaultExtension);
  const mime = mimeForFile(fileName);

  // -----------------------------------------------------------------------
  // Web platform — browser handles the download.
  // -----------------------------------------------------------------------
  if (Platform.OS === "web") {
    onEvent?.({ stage: "preparing", progress: 0, fileName });
    await Linking.openURL(url);
    onEvent?.({
      stage: "complete",
      progress: 1,
      fileName,
      uri: url,
      folderLabel: "browser",
      message: "Opened in browser",
    });
    return {
      uri: url,
      fileName,
      bytes: 0,
      savedToDownloads: false,
      folderLabel: "browser",
    };
  }

  // -----------------------------------------------------------------------
  // Android: get folder permission BEFORE we hit the network so the user
  // understands the flow. iOS skips this — share sheet appears after.
  // -----------------------------------------------------------------------
  let safDir: string | null = null;
  if (Platform.OS === "android") {
    onEvent?.({ stage: "asking-folder", progress: 0, fileName });
    safDir = await ensureSafDir();
    if (!safDir) {
      throw new PermissionDeniedError(
        "We need a folder to save into. Tap Download again and pick a folder (Downloads is recommended).",
      );
    }
  }

  // -----------------------------------------------------------------------
  // 1) Stream to cache.
  // -----------------------------------------------------------------------
  onEvent?.({ stage: "preparing", progress: 0.02, fileName });

  const cacheDir = FS.cacheDirectory ?? FS.documentDirectory;
  if (!cacheDir) throw new Error("No writable cache directory available");
  let tmpUri = `${cacheDir}${Date.now()}-${sanitize(fileName)}`;

  const runDownload = async (
    target: string,
    from: string,
  ): Promise<FS.FileSystemDownloadResult | null> => {
    const resumable = FS.createDownloadResumable(
      from,
      target,
      {},
      (p) => {
        const total = p.totalBytesExpectedToWrite || 0;
        const written = p.totalBytesWritten || 0;
        const ratio = total > 0 ? written / total : 0;
        onEvent?.({
          stage: "downloading",
          progress: Math.min(0.92, ratio * 0.92),
          fileName,
          bytesWritten: written,
          totalBytes: total,
        });
      },
    );

    const cancelInterval = setInterval(() => {
      if (signal?.aborted) resumable.cancelAsync().catch(() => {});
    }, 250);

    try {
      const res = await resumable.downloadAsync();
      return res ?? null;
    } finally {
      clearInterval(cancelInterval);
    }
  };

  let downloaded: FS.FileSystemDownloadResult | null;
  try {
    downloaded = await runDownload(tmpUri, url);
  } catch (e: any) {
    if (signal?.aborted) {
      onEvent?.({ stage: "cancelled", progress: 0, fileName });
      throw new Error("Download cancelled");
    }
    onEvent?.({
      stage: "error",
      progress: 0,
      fileName,
      error: e?.message || "Network error",
    });
    throw e;
  }

  if (!downloaded?.uri) {
    onEvent?.({ stage: "error", progress: 0, fileName, error: "No file received" });
    throw new Error("Download did not complete");
  }

  // -----------------------------------------------------------------------
  // 2) Sanity check: did we get HTML instead of the file?
  //    Common with Google Drive large files (confirm token page).
  // -----------------------------------------------------------------------
  const info = await FS.getInfoAsync(downloaded.uri);
  let size = (info as any).size ?? 0;

  if (size < 64 * 1024) {
    // Anything under 64KB might be a redirect/confirm page — peek inside.
    let head = "";
    try {
      head = await FS.readAsStringAsync(downloaded.uri, {
        encoding: FS.EncodingType.UTF8,
      });
    } catch {
      head = "";
    }

    if (/<html|<!DOCTYPE/i.test(head)) {
      // Try the Drive confirm bypass.
      const bypass = await maybeResolveDriveConfirmUrl(url, head);
      if (bypass) {
        await FS.deleteAsync(downloaded.uri, { idempotent: true });
        url = bypass;
        tmpUri = `${cacheDir}${Date.now()}-${sanitize(fileName)}`;
        onEvent?.({
          stage: "preparing",
          progress: 0.05,
          fileName,
          message: "Confirming large file with Google Drive…",
        });
        try {
          downloaded = await runDownload(tmpUri, url);
        } catch (e: any) {
          onEvent?.({
            stage: "error",
            progress: 0,
            fileName,
            error: e?.message || "Network error",
          });
          throw e;
        }
        if (!downloaded?.uri) {
          throw new Error("Drive confirm download did not complete");
        }
        const info2 = await FS.getInfoAsync(downloaded.uri);
        size = (info2 as any).size ?? 0;
      } else {
        await FS.deleteAsync(downloaded.uri, { idempotent: true });
        throw new Error(
          "The link returned a web page instead of a file. Open the link in a browser, accept any warning, and use the direct download URL.",
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // 3) Persist out of cache.
  // -----------------------------------------------------------------------
  onEvent?.({ stage: "saving", progress: 0.94, fileName });

  // ---- Android: SAF write into the chosen folder ----
  if (Platform.OS === "android" && safDir) {
    try {
      const targetUri = await FS.StorageAccessFramework.createFileAsync(
        safDir,
        fileName,
        mime,
      );
      const base64 = await FS.readAsStringAsync(downloaded.uri, {
        encoding: FS.EncodingType.Base64,
      });
      await FS.writeAsStringAsync(targetUri, base64, {
        encoding: FS.EncodingType.Base64,
      });
      await FS.deleteAsync(downloaded.uri, { idempotent: true });

      const folderLabel = await getSavedFolderLabel();
      onEvent?.({
        stage: "complete",
        progress: 1,
        fileName,
        uri: targetUri,
        folderLabel,
        bytesWritten: size,
        totalBytes: size,
        message: `Saved to ${folderLabel}`,
      });
      return {
        uri: targetUri,
        fileName,
        bytes: size,
        savedToDownloads: /downloads?/i.test(folderLabel),
        folderLabel,
      };
    } catch (e: any) {
      // SAF write itself failed (revoked permission, IO error, etc.).
      await clearSavedDownloadDir();
      onEvent?.({
        stage: "error",
        progress: 0,
        fileName,
        error: `Couldn't write to your chosen folder (${e?.message || "unknown"}). Tap Download again to re-select a folder.`,
      });
      throw new Error(
        `Couldn't write to your chosen folder. Tap Download again to re-select a folder.`,
      );
    }
  }

  // ---- iOS: share sheet → Save to Files ----
  if (Platform.OS === "ios" && (await Sharing.isAvailableAsync())) {
    await Sharing.shareAsync(downloaded.uri, {
      mimeType: mime,
      UTI: "public.data",
      dialogTitle: `Save ${fileName}`,
    });
    onEvent?.({
      stage: "complete",
      progress: 1,
      fileName,
      uri: downloaded.uri,
      folderLabel: "Files app",
      bytesWritten: size,
      totalBytes: size,
      message: "Use the share sheet to save the file",
    });
    return {
      uri: downloaded.uri,
      fileName,
      bytes: size,
      savedToDownloads: false,
      folderLabel: "Files app",
    };
  }

  // Last-ditch: tell the caller it's in app cache.
  onEvent?.({
    stage: "complete",
    progress: 1,
    fileName,
    uri: downloaded.uri,
    folderLabel: "app cache",
    message: "Saved to app cache",
  });
  return {
    uri: downloaded.uri,
    fileName,
    bytes: size,
    savedToDownloads: false,
    folderLabel: "app cache",
  };
}
