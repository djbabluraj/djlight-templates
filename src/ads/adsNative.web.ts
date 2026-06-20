// Web shim — the real adsNative.ts imports the AdMob library which has
// no web build.
export async function initAdsNative(): Promise<void> {
  // no-op on web
}
