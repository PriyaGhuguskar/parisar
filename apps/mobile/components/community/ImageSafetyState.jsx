// ImageSafetyState — per-photo state machine for the composer's D-01/D-02 image-safety gate.
//
// Visual contract per 06-UI-SPEC.md Screen 5 §Image-safety gate states table:
//   idle      → thumbnail + 28px X remove button (Phase 4 PhotoPicker remove device)
//   uploading → dim overlay (rgba(23,23,23,0.6)) + white ActivityIndicator + "Uploading…"
//   checking  → dim overlay + brand.500 spinner + "Checking image…" (the moderate-image gate)
//   pass      → overlay clears; a brief success.500 Check badge fades in top-right (200ms);
//               thumbnail normal with X remove
//   reject    → danger.500 1.5px border + danger.500 Ban overlay icon; the composer shows the
//               inline community.imgRejected error below the grid and BLOCKS submit until removed
//
// CRITICAL (D-02 fail-closed): the `reject` state is FULLY built even though the dev
// stub (MODERATION_PROVIDER=stub) auto-passes — it is the exact contract the real
// provider (Vision / Rekognition) lights up with ZERO UI change. The composer reads
// each photo's `state` to gate the Post button (disabled while any photo is uploading /
// checking / reject).
//
// The component is purely presentational: the PARENT (PostComposer) owns the state value
// and drives it through idle → uploading → checking → pass / reject. This component just
// renders the right overlay for the current state and exposes the X remove affordance.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Image } from "expo-image";
import { Ban, Check, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

const BRAND_500 = "#12715A";
const SUCCESS_500 = "#047857";
const DANGER_500 = "#c81e1e";

// The five canonical per-photo states. Exported so the composer + tests share the vocabulary.
export const IMAGE_SAFETY_STATES = ["idle", "uploading", "checking", "pass", "reject"];

// A photo is "blocking" (Post disabled) while it is mid-flight or rejected.
export function isBlockingState(state) {
  return state === "uploading" || state === "checking" || state === "reject";
}

/**
 * @param {{
 *   uri?: string|null,           // local preview URI for the thumbnail
 *   state: 'idle'|'uploading'|'checking'|'pass'|'reject',
 *   uploadingLabel: string,      // i18n community.imgUploading
 *   checkingLabel: string,       // i18n community.imgChecking
 *   onRemove?: () => void,
 *   size?: number,
 * }} props
 */
export function ImageSafetyState({
  uri,
  state = "idle",
  uploadingLabel,
  checkingLabel,
  onRemove,
  size = 80,
}) {
  // Brief success badge on PASS, then it fades out (200ms visible window).
  const [showPassBadge, setShowPassBadge] = useState(false);
  useEffect(() => {
    if (state !== "pass") {
      setShowPassBadge(false);
      return undefined;
    }
    setShowPassBadge(true);
    const t = setTimeout(() => setShowPassBadge(false), 1200);
    return () => clearTimeout(t);
  }, [state]);

  const rejected = state === "reject";
  const inFlight = state === "uploading" || state === "checking";
  // X remove is available unless the photo is mid-flight (we don't yank a photo while
  // it's uploading/checking — the parent flow owns those transitions).
  const canRemove = !inFlight;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#f5f5f5",
        borderWidth: rejected ? 1.5 : 0,
        borderColor: rejected ? DANGER_500 : "transparent",
      }}
      accessibilityRole="image"
      accessibilityLabel={`Photo ${state}`}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
      ) : null}

      {/* uploading / checking → dim overlay + spinner + caption */}
      {inFlight ? (
        <View
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(23,23,23,0.6)",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: 4,
          }}
        >
          <ActivityIndicator size="small" color={state === "checking" ? BRAND_500 : "#ffffff"} />
          <Text className="text-sm text-center" style={{ color: "#ffffff" }} numberOfLines={2}>
            {state === "checking" ? checkingLabel : uploadingLabel}
          </Text>
        </View>
      ) : null}

      {/* reject → danger overlay + Ban icon (fail-closed) */}
      {rejected ? (
        <View
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(239,68,68,0.35)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ban size={24} color={DANGER_500} />
        </View>
      ) : null}

      {/* pass → brief success Check badge top-right */}
      {showPassBadge ? (
        <View
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: SUCCESS_500,
            alignItems: "center",
            justifyContent: "center",
          }}
          accessibilityElementsHidden
        >
          <Check size={14} color="#ffffff" />
        </View>
      ) : null}

      {/* X remove (28px circle, Phase 4 PhotoPicker remove device) */}
      {canRemove ? (
        <Pressable
          onPress={(e) => {
            e?.stopPropagation?.();
            onRemove?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Remove photo"
          style={{
            position: "absolute",
            top: 4,
            right: 4,
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
    </View>
  );
}
