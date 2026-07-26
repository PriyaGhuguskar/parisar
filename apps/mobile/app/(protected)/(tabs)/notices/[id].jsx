// /(protected)/(tabs)/notices/[id] — notice detail with embedded PollBlock.
//
// Per 05-UI-SPEC.md Screen 3:
//   Section 1 — header card: title, "Posted by {{name}} ({{flat}}) at {{time}}"
//     (notice.postedByAt), full body (no truncation).
//   Section 2 — attachment (conditional):
//     PDF  → AttachmentPill row + "Tap to open" → Linking.openURL(signed URL).
//     image → 4:3 thumbnail → RN Modal lightbox (resizeMode contain).
//   Section 3 — PollBlock when getNoticeDetail returns a poll.
//   On mount: markNoticeRead(noticeId) (clears the list unread dot on return).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { getNoticeDetail, markNoticeRead, NOTICES_BUCKET } from "@parisar/api-client";
import { format } from "date-fns";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FileText, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { AttachmentPill } from "../../../../components/notices/AttachmentPill";
import { PollBlock } from "../../../../components/polls/PollBlock";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

function formatFlat(authorFlat) {
  if (!authorFlat) return "—";
  const wing = authorFlat?.wing?.name ?? "";
  const num = authorFlat?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

function safeAt(iso) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "HH:mm, dd MMM");
  } catch {
    return "";
  }
}

export default function NoticeDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation("notifications");
  const { id: noticeId } = useLocalSearchParams();
  const session = useAuthStore((s) => s.session);

  const jwtMeta = session?.user?.app_metadata ?? session?.user?.user_metadata ?? {};
  const role = jwtMeta.role ?? "member";

  const [notice, setNotice] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [poll, setPoll] = useState(null);
  const [options, setOptions] = useState([]);
  const [myVote, setMyVote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [signedUrl, setSignedUrl] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [toast, setToast] = useState(null); // { message, variant }

  const load = useCallback(async () => {
    if (!noticeId) return;
    setError(null);
    try {
      const supabase = getSupabase();
      const detail = await getNoticeDetail(supabase, noticeId);
      setNotice(detail.notice);
      setAttachments(detail.attachments);
      setPoll(detail.poll);
      setOptions(detail.options);
      setMyVote(detail.myVote);
    } catch (err) {
      console.warn("[notices/[id]] load failed:", err?.message ?? err);
      setError(err?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }, [noticeId]);

  useEffect(() => {
    load();
  }, [load]);

  // Mark read on mount (fast-follow no-op today; clears the list dot when wired).
  useEffect(() => {
    if (!noticeId) return;
    markNoticeRead(getSupabase(), noticeId).catch(() => {});
  }, [noticeId]);

  // Signed URL for the first attachment.
  useEffect(() => {
    let active = true;
    const att = attachments?.[0];
    if (!att?.storage_key) {
      setSignedUrl(null);
      return undefined;
    }
    (async () => {
      try {
        const supabase = getSupabase();
        const { data, error: sErr } = await supabase.storage
          .from(NOTICES_BUCKET)
          .createSignedUrl(att.storage_key, 3600);
        if (!active) return;
        setSignedUrl(sErr ? null : (data?.signedUrl ?? null));
      } catch {
        if (active) setSignedUrl(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [attachments]);

  if (loading) {
    return (
      <View className="flex-1 bg-neutral-50 items-center justify-center">
        <ActivityIndicator size="large" color="#12715A" />
      </View>
    );
  }
  if (error || !notice) {
    return (
      <View className="flex-1 bg-neutral-50 items-center justify-center px-8 gap-3">
        <Text className="text-xl font-semibold text-neutral-900 text-center">
          {t("notice.loadError")}
        </Text>
        <Text className="text-base text-neutral-600 text-center">{t("notice.loadErrorBody")}</Text>
        <Pressable
          onPress={load}
          className="h-10 px-4 rounded-lg border border-neutral-200 items-center justify-center mt-2"
          accessibilityRole="button"
        >
          <Text className="text-sm font-semibold text-neutral-900">Try again</Text>
        </Pressable>
      </View>
    );
  }

  const authorName = notice?.author?.full_name ?? "—";
  const authorFlat = formatFlat(notice?.author_flat);
  const postedAt = safeAt(notice?.created_at);
  const postedLine = t("notice.postedByAt", {
    name: authorName,
    flat: authorFlat,
    time: postedAt,
  });

  const att = attachments?.[0] ?? null;
  const isPdf = att?.mime_type === "application/pdf";

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
          {t("notice.detailTitle")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
        {/* Section 1 — header card */}
        <View className="bg-white rounded-xl p-6 gap-3">
          <Text className="text-xl font-semibold text-neutral-900">{notice.title}</Text>
          <Text className="text-sm text-neutral-600">{postedLine}</Text>
          <Text className="text-base text-neutral-900" style={{ lineHeight: 24 }}>
            {notice.body}
          </Text>
        </View>

        {/* Section 2 — attachment */}
        {att && signedUrl ? (
          isPdf ? (
            <Pressable
              onPress={() => Linking.openURL(signedUrl)}
              accessibilityRole="button"
              accessibilityLabel={t("notice.openAttachment")}
              className="bg-white rounded-xl p-4 flex-row items-center gap-3"
            >
              <FileText size={24} color="#12715A" />
              <View className="flex-1 gap-1">
                <AttachmentPill mimeType={att.mime_type} />
                <Text className="text-sm text-neutral-600">{t("notice.openAttachment")}</Text>
              </View>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setLightboxOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Open attachment photo"
              className="bg-white rounded-xl overflow-hidden"
              style={{ aspectRatio: 4 / 3 }}
            >
              <Image
                source={{ uri: signedUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                transition={150}
              />
            </Pressable>
          )
        ) : null}

        {/* Section 3 — PollBlock */}
        {poll ? (
          <PollBlock
            supabase={getSupabase()}
            poll={poll}
            options={options}
            myVote={myVote}
            role={role}
            onToast={(message, variant) => setToast({ message, variant })}
          />
        ) : null}
      </ScrollView>

      {/* Image lightbox */}
      <Modal
        visible={lightboxOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "#171717" }}>
          <Pressable
            onPress={() => setLightboxOpen(false)}
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
            <Image source={{ uri: signedUrl }} style={{ flex: 1 }} contentFit="contain" />
          ) : null}
        </View>
      </Modal>

      {/* Toast (vote / close feedback) */}
      {toast ? (
        <View
          className="absolute left-4 right-4 flex-row items-center gap-2 rounded-xl p-3"
          style={{
            top: 56,
            backgroundColor: toast.variant === "error" ? "#fef2f2" : "#ecfdf5",
            borderWidth: 1,
            borderColor: toast.variant === "error" ? "#c81e1e" : "#047857",
          }}
          accessibilityRole="alert"
        >
          <Text className="text-neutral-900 text-base">{toast.message}</Text>
        </View>
      ) : null}
    </View>
  );
}
