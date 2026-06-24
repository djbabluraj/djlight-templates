import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { AppState, AppStateStatus, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { colors } from "@/src/theme";
import { initAds } from "@/src/ads/ads";
import { primeInterstitial } from "@/src/ads/interstitial";
import { primeAppOpenAd, showAppOpenAd } from "@/src/ads/appOpenAd";

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  // Boot AdMob once at app startup. On web this resolves immediately as
  // a no-op (see ads.web.ts). Errors are swallowed inside initAds so a
  // failed ad SDK init never crashes the rest of the app.
  useEffect(() => {
    initAds()
      .then(() => {
        // Pre-cache an interstitial for the first download milestone.
        primeInterstitial();
        // Pre-cache an App Open ad for the next background→foreground
        // resume. We deliberately DO NOT show one on the very first
        // cold start — that would stack on top of the splash screen.
        primeAppOpenAd();
      })
      .catch(() => {});
  }, []);

  // App-open ad on background → active transitions. We use a ref to
  // track the previous state so we only fire on resumes (not on the
  // initial mount, which is `active` already).
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      // Show an app-open ad ONLY when coming from background/inactive
      // back to active. Show is best-effort and silently noop's when no
      // ad is ready (the native controller will reload one).
      if (
        (prev === "background" || prev === "inactive") &&
        nextState === "active"
      ) {
        showAppOpenAd();
      }
    });
    return () => sub.remove();
  }, []);

  // If the CDN is unreachable we fall through on error rather than wedging
  // the app — icons will tofu, but the app still boots.
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: colors.surface }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.surface },
              animation: "fade",
            }}
          />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
