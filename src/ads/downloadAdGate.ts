// Counts successful downloads in AsyncStorage (via the shared `storage`
// helper) and triggers an interstitial after every Nth one.
//
// We intentionally keep this small and platform-agnostic so the same file
// is used on web AND native — the underlying interstitial controller is
// the platform-specific piece (it's a no-op on web).
import { storage } from "@/src/utils/storage";

import { primeInterstitial, showInterstitial } from "./interstitial";

const KEY_DOWNLOAD_COUNT = "djl_download_count";
export const INTERSTITIAL_EVERY_N_DOWNLOADS = 3;

/** Increment the persistent successful-download counter and, every Nth
 *  download, attempt to display an interstitial ad. Returns the new
 *  count so callers can log / debug if needed. */
export async function recordSuccessfulDownload(): Promise<number> {
  const current = (await storage.getItem<number>(KEY_DOWNLOAD_COUNT, 0)) || 0;
  const next = current + 1;
  await storage.setItem(KEY_DOWNLOAD_COUNT, next);
  if (next % INTERSTITIAL_EVERY_N_DOWNLOADS === 0) {
    // Show now if ready; otherwise the controller will reload itself.
    const shown = showInterstitial();
    if (!shown) {
      // Best-effort: prime the next one so the upcoming milestone has it.
      primeInterstitial();
    }
  } else if (next % INTERSTITIAL_EVERY_N_DOWNLOADS === INTERSTITIAL_EVERY_N_DOWNLOADS - 1) {
    // One download before the next interstitial — make sure we have one
    // ready to fire.
    primeInterstitial();
  }
  return next;
}

/** Read the current count without mutating it (useful for tests / debug). */
export async function getDownloadCount(): Promise<number> {
  return (await storage.getItem<number>(KEY_DOWNLOAD_COUNT, 0)) || 0;
}
