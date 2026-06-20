// Public AdBanner. Returns null whenever the underlying native module is
// unavailable (web, Expo Go), otherwise renders the real banner loaded
// via a runtime require so the JS bridge never touches the missing
// TurboModule.
import React from "react";
import { ViewStyle } from "react-native";

import { adsAvailable } from "./runtime";

// Resolve the real implementation once. `require()` is only evaluated
// when `adsAvailable` is true, so Expo Go never tries to load it.
let RealAdBanner: React.ComponentType<{ style?: ViewStyle }> | null = null;
if (adsAvailable) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    RealAdBanner = require("./AdBannerNative").default;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[ads] AdBannerNative load failed (suppressed):", e);
    RealAdBanner = null;
  }
}

export function AdBanner({ style }: { style?: ViewStyle }) {
  if (!RealAdBanner) return null;
  return <RealAdBanner style={style} />;
}
