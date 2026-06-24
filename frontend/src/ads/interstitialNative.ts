// Native-only interstitial controller. Loaded via runtime require from
// interstitial.ts ONLY when `adsAvailable` is true.
import {
  AdEventType,
  InterstitialAd,
} from "react-native-google-mobile-ads";

import { AD_UNIT_IDS } from "./ads";

let instance: InterstitialAd | null = null;
let loaded = false;
let listenersAttached = false;

function getInstance(): InterstitialAd {
  if (!instance) {
    instance = InterstitialAd.createForAdRequest(AD_UNIT_IDS.interstitial, {
      requestNonPersonalizedAdsOnly: true,
    });
  }
  if (!listenersAttached) {
    instance.addAdEventListener(AdEventType.LOADED, () => {
      loaded = true;
      // eslint-disable-next-line no-console
      console.log("[ads] Interstitial loaded");
    });
    instance.addAdEventListener(AdEventType.CLOSED, () => {
      loaded = false;
      try {
        instance?.load();
      } catch {}
    });
    instance.addAdEventListener(AdEventType.ERROR, (e) => {
      loaded = false;
      // eslint-disable-next-line no-console
      console.warn("[ads] Interstitial error:", e?.message || e);
      setTimeout(() => {
        try {
          instance?.load();
        } catch {}
      }, 5000);
    });
    listenersAttached = true;
  }
  return instance;
}

export function primeInterstitialNative(): void {
  const ad = getInstance();
  if (loaded) return;
  try {
    ad.load();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[ads] Interstitial primeload failed", e);
  }
}

export function showInterstitialNative(): boolean {
  const ad = getInstance();
  if (!loaded) {
    try {
      ad.load();
    } catch {}
    return false;
  }
  try {
    ad.show();
    loaded = false;
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[ads] Interstitial show failed", e);
    return false;
  }
}
