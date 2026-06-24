// AdMob bootstrap. Static imports of `react-native-google-mobile-ads`
// are intentionally avoided here — the library is loaded only via a
// runtime `require()` guarded by `adsAvailable` (see runtime.ts). That
// keeps Expo Go safe: when the native module is missing, the require
// call is never executed.
import { adsAvailable } from "./runtime";

export const isNativeAdsEnabled = adsAvailable;

// Production AdMob IDs supplied by the app owner. Banner + interstitial
// existed before; appOpen is added in this iteration.
export const AD_UNIT_IDS = {
  banner: "ca-app-pub-2807659048981858/7168383466",
  interstitial: "ca-app-pub-2807659048981858/2845995072",
  appOpen: "ca-app-pub-2807659048981858/9308632507",
} as const;

let initPromise: Promise<void> | null = null;

export async function initAds(): Promise<void> {
  if (!adsAvailable) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      // Dynamic require so Metro doesn't try to resolve the native
      // module on web / Expo Go.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const native = require("./adsNative");
      await native.initAdsNative();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[ads] AdMob init failed (suppressed):", err);
    }
  })();
  return initPromise;
}
