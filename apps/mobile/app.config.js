/** @returns {import('expo/config').ExpoConfig} */
module.exports = ({ config: _config }) => ({
  name: "Parisar",
  slug: "parisar",
  scheme: "parisar",
  version: "0.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: { bundleIdentifier: "app.parisar.mobile", supportsTablet: true },
  android: { package: "app.parisar.mobile" },
  plugins: [
    "expo-router",
    "expo-image",
    "expo-notifications",
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
          "node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf",
          "node_modules/@expo-google-fonts/noto-sans/600SemiBold/NotoSans_600SemiBold.ttf",
          "node_modules/@expo-google-fonts/noto-sans-devanagari/400Regular/NotoSansDevanagari_400Regular.ttf",
          "node_modules/@expo-google-fonts/noto-sans-devanagari/600SemiBold/NotoSansDevanagari_600SemiBold.ttf",
        ],
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
