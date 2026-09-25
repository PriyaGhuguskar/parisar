const path = require("node:path");

// pnpm hoists packages to the monorepo root, so fonts are resolved by module
// lookup instead of a hardcoded apps/mobile/node_modules path.
const fontFile = (pkg, file) =>
  path.join(path.dirname(require.resolve(`${pkg}/package.json`)), file);

// Icon / splash background.
const WHITE = "#FFFFFF";

// EAS project created by `eas init` (https://expo.dev/accounts/priyasghuhuskar/projects/parisar).
// Public identifiers, not secrets. EAS Build requires the projectId; env vars
// can override them (e.g. to build under another account).
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? "83a4c1e4-117a-42c5-80ab-68db73d08548";
const EXPO_OWNER = process.env.EXPO_OWNER ?? "priyasghuhuskar";

/** @returns {import('expo/config').ExpoConfig} */
module.exports = ({ config: _config }) => ({
  name: "Parisar",
  slug: "parisar",
  ...(EXPO_OWNER ? { owner: EXPO_OWNER } : {}),
  scheme: "parisar",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    bundleIdentifier: "app.parisar.mobile",
    supportsTablet: true,
  },
  android: {
    package: "app.parisar.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: WHITE,
    },
  },
  plugins: [
    "expo-router",
    "expo-image",
    "expo-notifications",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: WHITE,
      },
    ],
    "@react-native-community/datetimepicker",
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow Parisar to access your photos so you can attach evidence to your complaints.",
        cameraPermission:
          "Allow Parisar to use the camera so you can take a photo for your complaint.",
      },
    ],
    [
      "expo-font",
      {
        fonts: [
          fontFile("@expo-google-fonts/noto-sans", "400Regular/NotoSans_400Regular.ttf"),
          fontFile("@expo-google-fonts/noto-sans", "600SemiBold/NotoSans_600SemiBold.ttf"),
          fontFile(
            "@expo-google-fonts/noto-sans-devanagari",
            "400Regular/NotoSansDevanagari_400Regular.ttf",
          ),
          fontFile(
            "@expo-google-fonts/noto-sans-devanagari",
            "600SemiBold/NotoSansDevanagari_600SemiBold.ttf",
          ),
        ],
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    // Required by EAS Build once `eas init` has created the project.
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
