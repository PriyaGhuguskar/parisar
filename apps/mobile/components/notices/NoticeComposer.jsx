// NoticeComposer — board-only notice composer (title + body + attachment + poll).
//
// Visual contract per 05-UI-SPEC.md Screen 2:
//   - Title input (3-120, char counter, warning.500 at 110+).
//   - Message multiline (numberOfLines=6, 10-2000, counter, warning.500 at 1900).
//   - Attachment field: PDF + image via pickAndUploadNoticeAttachment (dashed area;
//     FileText + filename for PDF, thumbnail for image; X remove; upload BEFORE the RPC).
//   - PollBuilder (optional, 2-4 options).
//   - Sticky full-width brand.500 h-14 "Post Notice", disabled until title+body valid,
//     spinner + notice.posting on submit.
//   - NO optimistic UI — await fileNotification, then onPosted() (parent navigates back;
//     the new card arrives via Realtime). Inline FormError on failure / notAuthorized.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Image } from "expo-image";
import { FileText, Paperclip, X } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { FormError } from "../auth/FormError";
import { PollBuilder } from "../polls/PollBuilder";

const TITLE_MIN = 3;
const TITLE_MAX = 120;
const BODY_MIN = 10;
const BODY_MAX = 2000;

/**
 * Ask the user whether to attach a PDF or a Photo.
 * Resolves with 'pdf' | 'photo' | null.
 */
function showAttachChooser(label) {
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Attach a PDF", "Attach a photo", "Cancel"], cancelButtonIndex: 2 },
        (idx) => {
          if (idx === 0) resolve("pdf");
          else if (idx === 1) resolve("photo");
          else resolve(null);
        },
      );
    } else {
      Alert.alert(label, undefined, [
        { text: "Attach a PDF", onPress: () => resolve("pdf") },
        { text: "Attach a photo", onPress: () => resolve("photo") },
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
      ]);
    }
  });
}

/**
 * @param {{
 *   societyId: string,
 *   noticeId: string,
 *   onSubmit: (payload: {
 *     title: string, body: string,
 *     storageKey: string|null, mimeType: string|null, byteSize: number|null,
 *     pollQuestion: string|null, pollOptions: string[]|null,
 *   }) => Promise<void>,
 *   submitting?: boolean,
 *   submitError?: string|null,
 * }} props
 */
export function NoticeComposer({
  societyId,
  noticeId,
  onSubmit,
  submitting = false,
  submitError = null,
}) {
  const { t } = useTranslation("notifications");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [poll, setPoll] = useState({ active: false, question: "", options: ["", ""] });

  // attachment: { storageKey, mimeType, byteSize, previewUri? } | null
  const [attachment, setAttachment] = useState(null);
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachError, setAttachError] = useState(null);

  async function handleAttach() {
    if (attachUploading || attachment) return;
    if (!societyId || !noticeId) {
      setAttachError(t("notice.attachError"));
      return;
    }
    setAttachError(null);
    const source = await showAttachChooser(t("notice.attachLabel"));
    if (!source) return;

    setAttachUploading(true);
    try {
      // Lazy import so this module stays web-safe (api-client dynamic-imports the
      // Expo natives internally; we only call the function).
      const { pickAndUploadNoticeAttachment } = await import("@parisar/api-client");
      // upload BEFORE the RPC (storage key = {societyId}/notifications/{noticeId}/...)
      const result = await pickAndUploadNoticeAttachment(getSupabaseSafe(), societyId, noticeId, {
        allowPdf: source === "pdf",
      });
      if (result) setAttachment(result);
    } catch (err) {
      console.warn("[NoticeComposer] attachment upload failed:", err?.message ?? err);
      const code = String(err?.message ?? "");
      setAttachError(
        code.toLowerCase().includes("large") ? t("notice.attachTooLarge") : t("notice.attachError"),
      );
    } finally {
      setAttachUploading(false);
    }
  }

  const titleValid = title.trim().length >= TITLE_MIN && title.trim().length <= TITLE_MAX;
  const bodyValid = body.trim().length >= BODY_MIN && body.trim().length <= BODY_MAX;
  const canSubmit = titleValid && bodyValid && !submitting && !attachUploading;

  async function handlePost() {
    if (!canSubmit) return;
    // Trim empty trailing poll options; null when poll inactive/invalid.
    const { normalizePoll } = await import("../polls/PollBuilder");
    const { pollQuestion, pollOptions, valid } = normalizePoll(poll);
    if (poll.active && !valid) {
      setAttachError(null);
      // surface via the poll area: a minimal inline guard
      Alert.alert("Poll incomplete", "Add a question and at least 2 options (max 4).");
      return;
    }
    await onSubmit({
      title: title.trim(),
      body: body.trim(),
      storageKey: attachment?.storageKey ?? null,
      mimeType: attachment?.mimeType ?? null,
      byteSize: attachment?.byteSize ?? null,
      pollQuestion,
      pollOptions,
    });
  }

  const titleCount = `${title.length}/${TITLE_MAX}`;
  const titleCountColor = title.length >= 110 ? "#f59e0b" : "#6e6e6e";
  const bodyCount = `${body.length}/${BODY_MAX}`;
  const bodyCountColor = body.length >= 1900 ? "#f59e0b" : "#6e6e6e";

  const isPdf = attachment?.mimeType === "application/pdf";

  return (
    <View className="flex-1">
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-white rounded-2xl p-4 gap-4">
          {/* Title */}
          <View className="gap-1">
            <Text className="text-sm text-neutral-600">{t("notice.titleLabel")}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t("notice.titlePlaceholder")}
              placeholderTextColor="#6e6e6e"
              maxLength={TITLE_MAX}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
              accessibilityLabel={t("notice.titleLabel")}
            />
            <Text className="text-sm self-end" style={{ color: titleCountColor }}>
              {titleCount}
            </Text>
          </View>

          {/* Message body */}
          <View className="gap-1">
            <Text className="text-sm text-neutral-600">{t("notice.bodyLabel")}</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder={t("notice.bodyPlaceholder")}
              placeholderTextColor="#6e6e6e"
              multiline
              numberOfLines={6}
              maxLength={BODY_MAX}
              textAlignVertical="top"
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
              style={{ minHeight: 120 }}
              accessibilityLabel={t("notice.bodyLabel")}
            />
            <Text className="text-sm self-end" style={{ color: bodyCountColor }}>
              {bodyCount}
            </Text>
          </View>

          {/* Attachment */}
          <View className="gap-1">
            <Text className="text-sm text-neutral-600">{t("notice.attachLabel")}</Text>
            <Pressable
              onPress={handleAttach}
              disabled={attachUploading || !!attachment}
              accessibilityRole="button"
              accessibilityLabel={t("notice.attachLabel")}
              style={{
                minHeight: attachment ? 120 : 96,
                backgroundColor: "#f5f5f5",
                borderRadius: 12,
                borderWidth: 1.5,
                borderStyle: "dashed",
                borderColor: attachError ? "#c81e1e" : "#e5e5e5",
                overflow: "hidden",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {attachment ? (
                isPdf ? (
                  <View className="flex-row items-center gap-2 px-4">
                    <FileText size={24} color="#12715A" />
                    <Text className="text-base text-neutral-900 flex-1" numberOfLines={1}>
                      {t("notice.attachmentPdf")}
                    </Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: attachment.previewUri ?? undefined }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                  />
                )
              ) : (
                <View className="items-center gap-1">
                  <Paperclip size={24} color="#6e6e6e" />
                  <Text className="text-sm text-neutral-400">{t("notice.attachLabel")}</Text>
                </View>
              )}

              {attachment ? (
                <Pressable
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    setAttachment(null);
                    setAttachError(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Remove attachment"
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: "rgba(23,23,23,0.6)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={16} color="#ffffff" />
                </Pressable>
              ) : null}

              {attachUploading ? (
                <View
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: "rgba(23,23,23,0.6)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ActivityIndicator size="large" color="#ffffff" />
                </View>
              ) : null}
            </Pressable>
            {attachError ? (
              <Text className="text-sm text-danger-500 mt-1" accessibilityRole="alert">
                {attachError}
              </Text>
            ) : null}
          </View>

          {/* Poll builder */}
          <PollBuilder value={poll} onChange={setPoll} />
        </View>

        {/* Submit error */}
        {submitError ? <FormError message={submitError} /> : null}
      </ScrollView>

      {/* Sticky Post Notice */}
      <View className="absolute left-4 right-4" style={{ bottom: 24 }}>
        <Pressable
          onPress={handlePost}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={t("notice.postCta")}
          accessibilityState={{ disabled: !canSubmit, busy: submitting }}
          className={`h-14 w-full rounded-xl items-center justify-center ${
            canSubmit ? "bg-brand-500 active:bg-brand-600" : "bg-neutral-200"
          }`}
        >
          {submitting ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator color="#ffffff" />
              <Text className="text-base font-semibold text-white">{t("notice.posting")}</Text>
            </View>
          ) : (
            <Text
              className={`text-base font-semibold ${canSubmit ? "text-white" : "text-neutral-400"}`}
            >
              {t("notice.postCta")}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// The composer pulls the live Supabase client lazily so this module doesn't import
// the app's supabase singleton at module scope (keeps it usable in isolation tests).
function getSupabaseSafe() {
  // eslint-disable-next-line global-require
  const { getSupabase } = require("../../lib/supabase");
  return getSupabase();
}
