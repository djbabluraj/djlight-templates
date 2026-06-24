// Runtime gate for AdMob.
//
// The native module `RNGoogleMobileAdsModule` exists ONLY inside a native
// dev/production build (custom dev client or Play Store APK). It does NOT
// exist in Expo Go nor on web. If we let the static `import` from
// `react-native-google-mobile-ads` execute in those environments, the JS
// bridge crashes immediately with:
//   "TurboModuleRegistry.getEnforcing(...): 'RNGoogleMobileAdsModule'
//    could not be found".
//
// To prevent that, every ads-related file uses a lazy `require()` guarded
// by this flag. The flag is computed once at app start; the heavy library
// is therefore only ever loaded when the native binary actually contains
// the module.
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";

// `executionEnvironment === StoreClient` ⇒ Expo Go.
// `Bare` or `Standalone` ⇒ custom dev build or Play Store build.
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const isNativePlatform = Platform.OS === "android" || Platform.OS === "ios";

/** True only when we are inside a built native app that includes the
 *  AdMob native module (i.e. NOT Expo Go and NOT web). */
export const adsAvailable: boolean = isNativePlatform && !isExpoGo;
