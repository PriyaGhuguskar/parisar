// PostComposer — community post composer with the D-01/D-02 synchronous image-safety gate.
//
// Visual contract per 06-UI-SPEC.md Screen 5.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { createPost, MAX_POST_PHOTOS } from "@parisar/api-client";
import { CheckCircle2, ImagePlus } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { pickAndCompressImage, showPhotoSourceChooser } from "../shared/image-capture";
import { cryptoRandomUUID } from "../shared/uuid";
import { Text } from "../ui/Text";
import { ImageSafetyState, isBlockingState } from "./ImageSafetyState";

const TEXT_MAX = 2000;
const DANGER_500 = "#c81e1e";

async function pickAndProcess(source) {
  const picked = await pickAndCompressImage(source);
  if (!picked) return null;
  return {
    photoId: cryptoRandomUUID(),
    previewUri: picked.uri,
    bytes: picked.bytes,
    mimeType: "image/jpeg",
  };
}

/**
 * @param {{ supabase: object, societyId: string, onSuccess?: () => void }} props
 */
export function PostComposer({ supabase, societyId, onSuccess }) {
  const { t } = useTranslation(["community", "auth"]);
  const [kind, setKind] = useState("general"); // default General
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  // Synchronous guard: state updates are async, so a fast double-tap could
  // start two createPost calls before `submitting` re-renders the button.
  const submitLockRef = useRef(false);
  // One post id per submit attempt, fixed before the first await so the
  // quarantine uploads and the moderation call can never disagree. A failed
  // attempt rotates it (its photos already sit under the old id and uploads
  // are upsert:false, so re-using it would collide).
  const postIdRef = useRef(cryptoRandomUUID());

  const textValid = text.trim().length >= 1 && text.trim().length <= TEXT_MAX;
  const anyBlocking = photos.some((p) => isBlockingState(p.state));
  const canSubmit = textValid && !anyBlocking && !submitting && !showSuccess;
  const hasReject = photos.some((p) => p.state === "reject");

  async function handleAddPhoto() {
    if (photos.length >= MAX_POST_PHOTOS) return;
    setSubmitError(null);
    const source = await showPhotoSourceChooser(t, t("community.photosLabel"));
    if (!source) return;

    const placeholderId = cryptoRandomUUID();
    // Optimistically show an uploading slot while the pick + resize run.
    setPhotos((prev) => [
      ...prev,
      { photoId: placeholderId, previewUri: null, state: "uploading" },
    ]);
    try {
      const processed = await pickAndProcess(source);
      if (!processed) {
        // Cancelled — drop the placeholder.
        setPhotos((prev) => prev.filter((p) => p.photoId !== placeholderId));
        return;
      }
      setPhotos((prev) =>
        prev.map((p) => (p.photoId === placeholderId ? { ...processed, state: "idle" } : p)),
      );
    } catch (err) {
      console.warn("[PostComposer] photo process failed:", err?.message ?? err);
      setPhotos((prev) => prev.filter((p) => p.photoId !== placeholderId));
      setSubmitError(t("community.imgUploadError"));
    }
  }

  function removePhoto(photoId) {
    setPhotos((prev) => prev.filter((p) => p.photoId !== photoId));
    setSubmitError(null);
  }

  async function handleSubmit() {
    if (!canSubmit || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitError(null);
    setSubmitting(true);
    let posted = false;

    // Flip every selected photo to `checking` for the duration of the gate.
    if (photos.length > 0) {
      setPhotos((prev) => prev.map((p) => ({ ...p, state: "checking" })));
    }

    try {
      const result = await createPost(supabase, {
        societyId,
        postId: postIdRef.current,
        kind,
        body: text.trim(),
        photos: photos.map((p) => ({ photoId: p.photoId, bytes: p.bytes, mimeType: p.mimeType })),
      });

      if (result?.ok) {
        // All photos PASSed → the post is created. Mark pass briefly, then navigate.
        // Stay locked/disabled from here on so the 1s success toast can't be
        // tapped through into a duplicate post.
        posted = true;
        setPhotos((prev) => prev.map((p) => ({ ...p, state: "pass" })));
        setShowSuccess(true);
        setTimeout(() => onSuccess?.(), 1000);
        return;
      }

      // ---- Fail-closed: NEVER published. ----
      if (Array.isArray(result?.rejected) && result.rejected.length > 0) {
        const rejectedIds = new Set(
          result.rejected
            .map((key) => {
              const file = String(key).split("/").pop() ?? "";
              return file.replace(/\.jpg$/i, "");
            })
            .filter(Boolean),
        );
        setPhotos((prev) =>
          prev.map((p) => ({
            ...p,
            state:
              rejectedIds.size > 0 ? (rejectedIds.has(p.photoId) ? "reject" : "idle") : "reject",
          })),
        );
        setSubmitError(t("community.imgRejected"));
      } else {
        // check_failed / service unreachable → fail-closed, do not publish.
        setPhotos((prev) => prev.map((p) => ({ ...p, state: "idle" })));
        setSubmitError(t("community.imgCheckError"));
      }
    } catch (err) {
      console.warn("[PostComposer] submit failed:", err?.message ?? err);
      setPhotos((prev) => prev.map((p) => (p.state === "checking" ? { ...p, state: "idle" } : p)));
      setSubmitError(t("community.postError"));
    } finally {
      if (!posted) {
        postIdRef.current = cryptoRandomUUID();
        submitLockRef.current = false;
        setSubmitting(false);
      }
    }
  }

  const textLen = text.length;
  const counterColor = textLen >= TEXT_MAX ? DANGER_500 : textLen >= 1900 ? "#f59e0b" : "#64748B";

  const types = useMemo(
    () => [
      { value: "sell", label: t("community.typeSell") },
      { value: "help", label: t("community.typeHelp") },
      { value: "general", label: t("community.typeGeneral") },
    ],
    [t],
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-white rounded-2xl p-4 gap-4">
          {/* Type segmented control */}
          <View className="gap-2">
            <Text className="text-sm text-neutral-600">{t("community.typeLabel")}</Text>
            <View className="flex-row bg-neutral-100 rounded-xl p-1">
              {types.map((typeOpt) => (
                <Pressable
                  key={typeOpt.value}
                  onPress={() => setKind(typeOpt.value)}
                  className={`flex-1 rounded-lg items-center justify-center ${
                    kind === typeOpt.value ? "bg-brand-500" : "bg-transparent"
                  }`}
                  style={{ minHeight: 44 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: kind === typeOpt.value }}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      kind === typeOpt.value ? "text-white" : "text-neutral-600"
                    }`}
                    numberOfLines={2}
                    style={{ textAlign: "center" }}
                  >
                    {typeOpt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Text */}
          <View className="gap-1">
            <Text className="text-sm text-neutral-600">{t("community.textLabel")}</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t("community.textPlaceholder")}
              placeholderTextColor="#64748B"
              multiline
              numberOfLines={5}
              maxLength={TEXT_MAX}
              textAlignVertical="top"
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
              style={{ minHeight: 120 }}
            />
            <Text className="text-sm self-end" style={{ color: counterColor }}>
              {`${textLen}/${TEXT_MAX}`}
            </Text>
          </View>

          {/* Photos + image-safety states */}
          <View className="gap-2">
            <Text className="text-sm text-neutral-600">{t("community.photosLabel")}</Text>
            <View className="flex-row flex-wrap gap-2">
              {photos.map((p) => (
                <ImageSafetyState
                  key={p.photoId}
                  uri={p.previewUri}
                  state={p.state}
                  uploadingLabel={t("community.imgUploading")}
                  checkingLabel={t("community.imgChecking")}
                  onRemove={() => removePhoto(p.photoId)}
                />
              ))}

              {photos.length < MAX_POST_PHOTOS ? (
                <Pressable
                  onPress={handleAddPhoto}
                  disabled={submitting || showSuccess}
                  accessibilityRole="button"
                  accessibilityLabel={t("community.photosLabel")}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderStyle: "dashed",
                    borderColor: "#E2E8F0",
                    backgroundColor: "#F1F5F9",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ImagePlus size={24} color="#64748B" />
                </Pressable>
              ) : null}
            </View>

            {/* Inline reject error below the grid (D-02 — blocks submit until removed) */}
            {hasReject ? (
              <Text className="text-sm" style={{ color: DANGER_500 }} accessibilityRole="alert">
                {t("community.imgRejected")}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Generic / check error (distinct from the per-photo reject) */}
        {submitError && !hasReject ? (
          <Text className="text-sm" style={{ color: DANGER_500 }} accessibilityRole="alert">
            {submitError}
          </Text>
        ) : null}

        {/* Post submit */}
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={t("community.postCta")}
          accessibilityState={{ disabled: !canSubmit, busy: submitting }}
          className={[
            "h-14 w-full rounded-xl items-center justify-center",
            canSubmit ? "bg-brand-500 active:bg-brand-600" : "bg-neutral-200",
          ].join(" ")}
        >
          {submitting ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator color="#ffffff" />
              <Text className="text-base font-semibold text-white">{t("community.posting")}</Text>
            </View>
          ) : (
            <Text
              className={`text-base font-semibold ${canSubmit ? "text-white" : "text-neutral-400"}`}
            >
              {t("community.postCta")}
            </Text>
          )}
        </Pressable>
      </ScrollView>

      {showSuccess ? (
        <View
          className="absolute left-4 right-4 flex-row items-center gap-2 rounded-xl p-3"
          style={{ top: 16, backgroundColor: "#ecfdf5" }}
          accessibilityRole="alert"
        >
          <CheckCircle2 size={16} color="#047857" />
          <Text className="text-neutral-900 text-base">{t("community.postSuccess")}</Text>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
