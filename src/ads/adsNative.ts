// Native-only AdMob initialization. This file is loaded via a runtime
// `require()` from ads.ts ONLY when `adsAvailable` is true. The static
// imports here therefore never execute inside Expo Go / web.
import mobileAds, {
  MaxAdContentRating,
} from "react-native-google-mobile-ads";

export async function initAdsNative(): Promise<void> {
  await mobileAds().setRequestConfiguration({
    maxAdContentRating: MaxAdContentRating.G,
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: false,
  });
  await mobileAds().initialize();
  // eslint-disable-next-line no-console
  console.log("[ads] AdMob initialized (test mode)");
}
