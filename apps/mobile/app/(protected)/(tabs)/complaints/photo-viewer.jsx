// /(protected)/complaints/photo-viewer — fullscreen complaint photo modal.
//
// Per 04-UI-SPEC.md Screen 3 Section 2 (Fullscreen modal):
//   - Full black background
//   - Image at resizeMode='contain', centered
//   - X close button top-left (44×44 tap target, white icon)
//
// Pinch-to-zoom intentionally NOT wired (research note: scope-trim — Reanimated
// is on RN 3.10 here which lacks PinchGestureHandler out-of-the-box; deferring
// per UI-SPEC's "skip pinch if not installed" allowance).

import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

export default function PhotoViewerScreen() {
  const router = useRouter();
  const { signedUrl } = useLocalSearchParams();

  return (
    <View style={{ flex: 1, backgroundColor: "#171717" }}>
      {/* Close button */}
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close photo"
        style={{
          position: "absolute",
          top: 48,
          left: 16,
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "rgba(255,255,255,0.15)",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
        }}
      >
        <X size={24} color="#ffffff" />
      </Pressable>

      {signedUrl ? (
        <Image
          source={{ uri: String(signedUrl) }}
          style={{ flex: 1 }}
          contentFit="contain"
          accessibilityLabel="Complaint photo"
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <Text className="text-white text-base">No photo to display.</Text>
        </View>
      )}
    </View>
  );
}
