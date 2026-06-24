// Public interstitial API. Both functions are safe to call from any
// platform — they no-op outside a native build with the AdMob library.
import { adsAvailable } from "./runtime";

let native: typeof import("./interstitialNative") | null = null;

function getNative(): typeof import("./interstitialNative") | null {
  if (!adsAvailable) return null;
  if (native) return native;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    native = require("./interstitialNative");
    return native;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[ads] Interstitial native load failed (suppressed):", e);
    native = null;
    return null;
  }
}

export function primeInterstitial(): void {
  getNative()?.primeInterstitialNative();
}

export function showInterstitial(): boolean {
  return getNative()?.showInterstitialNative() ?? false;
}
