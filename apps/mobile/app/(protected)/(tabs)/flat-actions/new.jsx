// /(protected)/(tabs)/flat-actions/new — Issue Flat Action (ADMIN ONLY).
//
// Per 06-UI-SPEC.md Screen 1:
//   - Admin-only client route guard (T-06-17 — defence in depth; the RPC + RLS are the
//     server authority). A non-admin sees a defensive inline notAuthorized message, no form.
//   - Renders IssueActionForm (FlatPicker + kind selector + Fine fields + PDF + LOCKED footer).
//   - Loads the society's flats for the picker.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { IssueActionForm } from "../../../../components/flat-actions/IssueActionForm";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

export default function NewFlatActionScreen() {
  const router = useRouter();
  const { t } = useTranslation("flat-actions");
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;
  const role = jwtMeta.role ?? "member";
  const isAdmin = ADMIN_ROLES.has(role);

  const [flats, setFlats] = useState([]);

  useEffect(() => {
    if (!isAdmin || !societyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getSupabase()
          .from("flats")
          .select("id, number, wing:wing_id ( name )")
          .eq("society_id", societyId)
          .order("number");
        if (!cancelled) setFlats(data ?? []);
      } catch {
        if (!cancelled) setFlats([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, societyId]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-neutral-50"
    >
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
          {t("flatAction.issueTitle")}
        </Text>
      </View>

      {/* Admin-only route guard (defence in depth) */}
      {!isAdmin ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-base text-neutral-600 text-center" accessibilityRole="alert">
            {t("flatAction.notAuthorized")}
          </Text>
        </View>
      ) : (
        <IssueActionForm
          supabase={getSupabase()}
          societyId={societyId}
          flats={flats}
          onSuccess={() => router.back()}
        />
      )}
    </KeyboardAvoidingView>
  );
}
