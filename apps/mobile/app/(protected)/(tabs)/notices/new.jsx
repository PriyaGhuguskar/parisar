// /(protected)/(tabs)/notices/new — board-only notice composer host.
//
// Per 05-UI-SPEC.md Screen 2:
//   - Board-role gate: non-board roles are redirected to /(protected)/(tabs)/notices
//     (client guard — RLS + file_notification RPC enforce server-side, T-05-02).
//   - Pre-generate the noticeId so the attachment uploads to the canonical storage
//     key BEFORE the file_notification RPC inserts the row.
//   - On submit: call fileNotification with the poll fields, then navigate back
//     (the new card arrives via Realtime — NO optimistic UI). Success toast.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { fileNotification } from "@parisar/api-client";
import { Redirect, useRouter } from "expo-router";
import { CheckCircle2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { NoticeComposer } from "../../../../components/notices/NoticeComposer";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

// Cross-runtime UUID — mirrors the api-client uuid.js / complaints/new.jsx helper.
function cryptoRandomUUID() {
  const g = globalThis.crypto;
  if (g && typeof g.randomUUID === "function") return g.randomUUID();
  const bytes = new Uint8Array(16);
  if (g && typeof g.getRandomValues === "function") g.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function NewNoticeScreen() {
  const router = useRouter();
  const { t } = useTranslation("notifications");
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const societyId = jwtMeta.society_id ?? null;
  const role = jwtMeta.role ?? "member";
  const isBoard = BOARD_ROLES.has(role);

  // Pre-generate the noticeId once per mount (stable storage prefix for the upload).
  const noticeId = useMemo(() => cryptoRandomUUID(), []);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Board-role gate (T-05-02 client defense-in-depth). Redirect non-board away.
  if (!isBoard) {
    return <Redirect href="/(protected)/(tabs)/notices" />;
  }

  async function handleSubmit(payload) {
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const supabase = getSupabase();
      // NO optimistic UI — await the RPC; the new card arrives via Realtime.
      await fileNotification(supabase, {
        title: payload.title,
        body: payload.body,
        noticeId,
        storageKey: payload.storageKey,
        mimeType: payload.mimeType,
        byteSize: payload.byteSize,
        pollQuestion: payload.pollQuestion,
        pollOptions: payload.pollOptions,
      });
      setShowSuccess(true);
      setTimeout(() => router.back(), 1200);
    } catch (err) {
      console.warn("[notices/new] submit failed:", err?.message ?? err);
      const code = String(err?.message ?? "");
      if (code.includes("INSUFFICIENT_ROLE")) {
        setSubmitError(t("notice.notAuthorized"));
      } else {
        setSubmitError(t("notice.postError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

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
          {t("notice.composeTitle")}
        </Text>
      </View>

      <NoticeComposer
        societyId={societyId}
        noticeId={noticeId}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitError={submitError}
      />

      {/* Success toast */}
      {showSuccess ? (
        <View
          className="absolute left-4 right-4 flex-row items-center gap-2 bg-white border border-success-500 rounded-xl p-3"
          style={{ top: 56, backgroundColor: "#ecfdf5" }}
          accessibilityRole="alert"
        >
          <CheckCircle2 size={16} color="#047857" />
          <Text className="text-neutral-900 text-base">{t("notice.postSuccess")}</Text>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
