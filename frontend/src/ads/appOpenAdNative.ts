// Native-only App Open ad controller. Loaded via runtime `require()` from
// appOpenAd.ts ONLY when `adsAvailable` is true.
//
// Google's guidance for App Open Ads:
//   • cache one ad ahead of time;
//   • expire the cached ad after ~4 hours (or after one show);
//   • show only on foreground resume — not while the user is mid-flow;
//   • always reload a fresh ad after the previous one is dismissed.
import {
  AdEventType,
  AppOpenAd,
} from "react-native-google-mobile-ads";

import { AD_UNIT_IDS } from "./ads";

// Stale-cache window (Google recommends < 4h; we use 3.5h to be safe).
const MAX_AGE_MS = 1000 * 60 * 60 * 3.5;

let instance: AppOpenAd | null = null;
let loaded = false;
let loadedAt = 0;
let listenersAttached = false;
let showing = false;

function getInstance(): AppOpenAd {
  if (!instance) {
    instance = AppOpenAd.createForAdRequest(AD_UNIT_IDS.appOpen, {
      requestNonPersonalizedAdsOnly: true,
    });
  }
  if (!listenersAttached) {
    instance.addAdEventListener(AdEventType.LOADED, () => {
      loaded = true;
      loadedAt = Date.now();
      // eslint-disable-next-line no-console
      console.log("[ads] AppOpenAd loaded");
    });
    instance.addAdEventListener(AdEventType.CLOSED, () => {
      loaded = false;
      showing = false;
      // Pre-cache the next one.
      try {
        instance?.load();
      } catch {}
    });
    instance.addAdEventListener(AdEventType.ERROR, (e) => {
      loaded = false;
      showing = false;
      // eslint-disable-next-line no-console
      console.warn("[ads] AppOpenAd error:", e?.message || e);
      // Retry after a short backoff.
      setTimeout(() => {
        try {
          instance?.load();
        } catch {}
      }, 10000);
    });
    listenersAttached = true;
  }
  return instance;
}

function isFresh(): boolean {
  return loaded && Date.now() - loadedAt < MAX_AGE_MS;
}

export function primeAppOpenAdNative(): void {
  const ad = getInstance();
  if (isFresh() || showing) return;
  try {
    ad.load();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[ads] AppOpenAd primeload failed", e);
  }
}

export function showAppOpenAdNative(): boolean {
  const ad = getInstance();
  if (showing) return false;
  if (!isFresh()) {
    // Don't show stale ads; kick off a refresh.
    try {
      ad.load();
    } catch {}
    return false;
  }
  try {
    showing = true;
    ad.show();
    return true;
  } catch (e) {
    showing = false;
    // eslint-disable-next-line no-console
    console.warn("[ads] AppOpenAd show failed", e);
    return false;
  }
}

export function isAppOpenAdReadyNative(): boolean {
  return isFresh() && !showing;
}
