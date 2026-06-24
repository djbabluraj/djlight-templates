// Web shim — the real AdBannerNative.tsx imports the AdMob native
// library which has no web build. Metro picks this file on web (via the
// `.web.tsx` platform extension), so the heavy library is never bundled
// for the web target.
import React from "react";
import { ViewStyle } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function AdBannerNative(_props: { style?: ViewStyle }) {
  return null;
}
