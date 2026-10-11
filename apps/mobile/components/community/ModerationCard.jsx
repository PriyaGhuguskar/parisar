// ModerationCard — a reported+hidden post/comment in the Secretary moderation queue.
//
// Visual contract per 06-UI-SPEC.md Screen 8 §ModerationCard (PostCard token clone).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { OwnerChip } from "../complaints/OwnerChip";
import { PhotoGrid } from "./PhotoGrid";

const SUCCESS_500 = "#047857";
const DANGER_500 = "#c81e1e";

function formatFlat(flatJoin) {
  if (!flatJoin) return "—";
  const wing = flatJoin?.wing?.name ?? "";
  const num = flatJoin?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

function safeAge(iso) {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

/**
 * @param {{
 *   item: object,
 *   reportCount?: number,
 *   reasons?: string,
 *   attachments?: Array,
 *   supabase?: object,
 *   onRestore?: (item: object) => void,
 *   onTakedown?: (item: object) => void,
 *   restoring?: boolean,
 *   takingDown?: boolean,
 * }} props
 */
export function ModerationCard({
  item,
  reportCount = 1,
  reasons = "",
  attachments = [],
  supabase,
  onRestore,
  onTakedown,
  restoring = false,
  takingDown = false,
}) {
  const { t } = useTranslation("moderation");
  const isPost = (item?.kind ?? "post") === "post";
  const kindLabel = isPost ? t("moderation.kindPost") : t("moderation.kindComment");
  const age = safeAge(item?.hidden_at ?? item?.created_at);

  const authorName = item?.author?.full_name ?? "—";
  const authorFlat = formatFlat(item?.author_flat);
  const authorLabel = `${authorName} (${authorFlat})`;

  return (
    <View
      className="bg-white rounded-xl p-4 gap-2"
      style={{ borderWidth: 1, borderColor: "#f59e0b" }}
    >
      {/* Top row: kind pill + report count + age */}
      <View className="flex-row items-center gap-2">
        <View
          className="rounded-full px-2 py-0.5 bg-neutral-100"
          style={{ alignSelf: "flex-start" }}
        >
          <Text className="text-sm text-neutral-600">{kindLabel}</Text>
        </View>
        <Text className="text-sm text-neutral-600">
          {t("moderation.reportCount", { n: String(reportCount) })}
        </Text>
        {age ? (
          <Text className="text-sm text-neutral-400 ml-auto" numberOfLines={1}>
            {age}
          </Text>
        ) : null}
      </View>

      {/* Reported content preview (the only place hidden content renders) */}
      <Text className="text-base text-neutral-900" numberOfLines={4}>
        {item?.body ?? ""}
      </Text>

      {isPost && attachments && attachments.length > 0 ? (
        <PhotoGrid attachments={attachments} supabase={supabase} />
      ) : null}

      <OwnerChip label={authorLabel} />

      {/* Reason summary */}
      {reasons ? (
        <Text className="text-sm text-neutral-600">{t("moderation.reportedFor", { reasons })}</Text>
      ) : null}

      {/* Action row */}
      <View className="flex-row gap-2 mt-1">
        <RestoreButton t={t} onRestore={() => onRestore?.(item)} restoring={restoring} />
        <TakedownButton t={t} onTakedown={() => onTakedown?.(item)} takingDown={takingDown} />
      </View>
    </View>
  );
}

// Restore — success.500 outlined, inline confirm.
function RestoreButton({ t, onRestore, restoring }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Pressable
        onPress={() => setConfirming(true)}
        disabled={restoring}
        accessibilityRole="button"
        accessibilityLabel={t("moderation.restoreCta")}
        className="flex-1 h-10 px-4 rounded-lg items-center justify-center bg-white"
        style={{ borderWidth: 1.5, borderColor: SUCCESS_500 }}
      >
        <Text className="text-base font-semibold" style={{ color: SUCCESS_500 }}>
          {t("moderation.restoreCta")}
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="flex-1 gap-1">
      <Text className="text-sm text-neutral-600">{t("moderation.restoreConfirm")}</Text>
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => onRestore?.()}
          disabled={restoring}
          accessibilityRole="button"
          accessibilityLabel={t("moderation.restoreCta")}
          accessibilityState={{ disabled: restoring, busy: restoring }}
          className="flex-1 h-10 rounded-lg items-center justify-center bg-white"
          style={{ borderWidth: 1.5, borderColor: SUCCESS_500 }}
        >
          {restoring ? (
            <ActivityIndicator color={SUCCESS_500} />
          ) : (
            <Text className="text-base font-semibold" style={{ color: SUCCESS_500 }}>
              {t("moderation.restoreCta")}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => setConfirming(false)}
          disabled={restoring}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          className="flex-1 h-10 rounded-lg items-center justify-center border border-neutral-200"
        >
          <Text className="text-base text-neutral-600">Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Confirm-takedown — danger.500 fill, inline "can't be undone" confirm.
function TakedownButton({ t, onTakedown, takingDown }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Pressable
        onPress={() => setConfirming(true)}
        disabled={takingDown}
        accessibilityRole="button"
        accessibilityLabel={t("moderation.takedownCta")}
        className="flex-1 h-10 px-4 rounded-lg items-center justify-center"
        style={{ backgroundColor: DANGER_500 }}
      >
        <Text className="text-base font-semibold text-white">{t("moderation.takedownCta")}</Text>
      </Pressable>
    );
  }

  return (
    <View className="flex-1 gap-1">
      <Text className="text-sm text-neutral-600">{t("moderation.takedownConfirm")}</Text>
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => onTakedown?.()}
          disabled={takingDown}
          accessibilityRole="button"
          accessibilityLabel={t("moderation.takedownCta")}
          accessibilityState={{ disabled: takingDown, busy: takingDown }}
          className="flex-1 h-10 rounded-lg items-center justify-center"
          style={{ backgroundColor: DANGER_500 }}
        >
          {takingDown ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-white">
              {t("moderation.takedownCta")}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => setConfirming(false)}
          disabled={takingDown}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          className="flex-1 h-10 rounded-lg items-center justify-center border border-neutral-200"
        >
          <Text className="text-base text-neutral-600">Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}
