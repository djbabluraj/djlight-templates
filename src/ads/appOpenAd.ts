// Public App Open Ad API. Mirrors the pattern of interstitial.ts:
// the heavy `react-native-google-mobile-ads` import is only `require()`'d
// at runtime when `adsAvailable` is true, so Expo Go and the web preview
// never touch the missing native module.
import { adsAvailable } from "./runtime";

let native: typeof import("./appOpenAdNative") | null = null;

function getNative(): typeof import("./appOpenAdNative") | null {
  if (!adsAvailable) return null;
  if (native) return native;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    native = require("./appOpenAdNative");
    return native;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[ads] AppOpenAd native load failed (suppressed):", e);
    native = null;
    return null;
  }
}

/** Pre-cache an app-open ad so it's ready the next time the app
 *  comes to the foreground. Safe to call repeatedly. */
export function primeAppOpenAd(): void {
  getNative()?.primeAppOpenAdNative();
}

/** Attempt to show a loaded app-open ad. Returns true on success, false
 *  if no ad was ready (caller can decide whether to retry). The native
 *  side automatically reloads a fresh ad after it closes. */
export function showAppOpenAd(): boolean {
  return getNative()?.showAppOpenAdNative() ?? false;
}

/** Has the controller successfully cached an ad that's still fresh? */
export function isAppOpenAdReady(): boolean {
  return getNative()?.isAppOpenAdReadyNative() ?? false;
}
