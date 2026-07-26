// /(protected)/(tabs)/community/new — Post composer route (COMM-01/03, all roles).
//
// Per 06-UI-SPEC.md Screen 5: renders PostComposer. On success, navigate back to the feed —
// the new post appears via Realtime after the image-safety gate PASSes (no optimistic row).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { PostComposer } from "../../../../components/community/PostComposer";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

export default function NewPostScreen() {
  const router = useRouter();
  const { t } = useTranslation("community");
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;

  return (
    <View className="flex-1 bg-neutral-50">
      {/* Header */}
      <View className="px-4 pt-12 pb-3 bg-white border-b border-neutral-100 flex-row items-center gap-3">
        <Pressable
          onPress={() => router.back()}
          className="p-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text className="text-base text-brand-500">{"←"}</Text>
        </Pressable>
        <Text className="text-xl font-semibold text-neutral-900 flex-1">
          {t("community.composeTitle")}
        </Text>
      </View>

      <PostComposer
        supabase={getSupabase()}
        societyId={societyId}
        onSuccess={() => router.back()}
      />
    </View>
  );
}
