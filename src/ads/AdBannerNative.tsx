// Native-only banner. Loaded by `require("./AdBannerNative")` from
// AdBanner.tsx ONLY when `adsAvailable` is true — so the static import
// of `react-native-google-mobile-ads` below never executes in Expo Go.
import React, { useRef } from "react";
import { Platform, StyleSheet, View, ViewStyle } from "react-native";
import {
  BannerAd,
  BannerAdSize,
  useForeground,
} from "react-native-google-mobile-ads";

import { AD_UNIT_IDS } from "./ads";

export default function AdBannerNative({ style }: { style?: ViewStyle }) {
  const bannerRef = useRef<BannerAd>(null);

  // iOS-only refresh on foreground (harmless on Android).
  useForeground(() => {
    if (Platform.OS === "ios") {
      bannerRef.current?.load();
    }
  });

  return (
    <View style={[styles.wrap, style]}>
      <BannerAd
        ref={bannerRef}
        unitId={AD_UNIT_IDS.banner}
        size={BannerAdSize.BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdFailedToLoad={(e) => {
          // eslint-disable-next-line no-console
          console.warn("[ads] Banner failed to load:", e?.message || e);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
});
