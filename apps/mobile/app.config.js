const fs = require("node:fs");
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

// Android push (FCM) needs the Firebase project's google-services.json.
// WHAT YOU MUST PROVIDE: in the Firebase console, add an Android app with
// package "app.parisar.mobile", download google-services.json and either
//   - put it at apps/mobile/google-services.json (git-ignore it), or
//   - point GOOGLE_SERVICES_JSON at it (an EAS file secret works too:
//     `eas env:create --name GOOGLE_SERVICES_JSON --type file ...`).
// Then upload the FCM V1 service-account key to EAS (`eas credentials`) so the
// Expo push service can deliver. Without the file, builds still work but
// Android devices get no push token.
const GOOGLE_SERVICES_FILE =
  process.env.GOOGLE_SERVICES_JSON ??
  (fs.existsSync(path.join(__dirname, "google-services.json"))
    ? "./google-services.json"
    : undefined);

// Everything in `extra` is embedded in the app binary and readable by anyone
// who downloads it. Only the public Supabase URL + anon/publishable key and the
// website URL belong there. Fail the build if a privileged key was configured
// by mistake (legacy service_role JWT or a new-format `sb_secret_` key).
function assertPublicSupabaseKey(key) {
  if (!key) return key;
  if (key.startsWith("sb_secret_")) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_ANON_KEY is a secret key — use the anon/publishable key.",
    );
  }
  const parts = key.split(".");
  if (parts.length === 3) {
    let role;
    try {
      role = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role;
    } catch {
      role = undefined;
    }
    if (role && role !== "anon") {
      throw new Error(
        `EXPO_PUBLIC_SUPABASE_ANON_KEY has role "${role}" — only the anon key may ship in the app.`,
      );
    }
  }
  return key;
}

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
    // Only standard HTTPS/TLS is used (exempt from export documentation).
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: "app.parisar.mobile",
    // Never let Android cloud/adb backup copy app data (auth session, prefs).
    allowBackup: false,
    // Only what the app uses: camera + photo picker (complaint/community
    // photos) and notifications. Library/template extras are blocked below.
    // Cleartext HTTP is only enabled by the generated debug manifest; release
    // builds use the platform default (HTTPS only).
    // (Photo-library access on older Android is declared by expo-image-picker.)
    permissions: [
      "android.permission.CAMERA",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.VIBRATE",
    ],
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      "android.permission.READ_CONTACTS",
      "android.permission.READ_PHONE_STATE",
    ],
    ...(GOOGLE_SERVICES_FILE ? { googleServicesFile: GOOGLE_SERVICES_FILE } : {}),
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
        // Photos only — no video recording, so no microphone permission.
        microphonePermission: false,
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
    supabaseAnonKey: assertPublicSupabaseKey(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
    // Website origin for shareable invite links (lib/join-link.js); without it
    // invites use the parisar:// scheme above, handled by app/join.jsx.
    appUrl: process.env.EXPO_PUBLIC_APP_URL,
    // Required by EAS Build once `eas init` has created the project.
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
