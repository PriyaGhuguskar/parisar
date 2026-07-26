// CommentItem — a single text comment on a post (ResponseTrailItem token clone).
//
// Visual contract per 06-UI-SPEC.md Screen 6 §CommentItem (COMM-04).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { formatDistanceToNow } from "date-fns";
import { Flag, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

const DANGER_500 = "#c81e1e";
const NEUTRAL_400 = "#6e6e6e";

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
 *   comment: object,
 *   onReport?: (comment: object) => void,
 *   onDelete?: (comment: object) => void,
 *   currentUserId?: string|null,
 * }} props
 */
export function CommentItem({ comment, onReport, onDelete, currentUserId = null }) {
  const { t } = useTranslation("community");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const name = comment?.author?.full_name ?? "—";
  const flat = formatFlat(comment?.author_flat);
  const age = safeAge(comment?.created_at);
  const byLine = t("community.commentBy", { name, flat, age });

  const isAuthor = !!currentUserId && comment?.author_id === currentUserId;

  return (
    <View className="bg-white rounded-xl p-4 gap-2">
      <View className="flex-row items-center gap-2">
        <Text className="text-sm text-neutral-600 flex-1" numberOfLines={2}>
          {byLine}
        </Text>

        {isAuthor ? (
          <Pressable
            onPress={() => setConfirmingDelete((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="Delete comment"
            className="p-1"
          >
            <Trash2 size={14} color={NEUTRAL_400} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => onReport?.(comment)}
            accessibilityRole="button"
            accessibilityLabel={t("community.reportConfirm")}
            className="p-1"
          >
            <Flag size={14} color={NEUTRAL_400} />
          </Pressable>
        )}
      </View>

      <Text className="text-base text-neutral-900">{comment?.body ?? ""}</Text>

      {isAuthor && confirmingDelete ? (
        <View className="gap-2 mt-1">
          <Text className="text-sm text-neutral-600">{t("community.deleteCommentConfirm")}</Text>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => {
                setConfirmingDelete(false);
                onDelete?.(comment);
              }}
              accessibilityRole="button"
              accessibilityLabel={t("community.deleteCommentConfirm")}
              className="flex-1 h-10 rounded-lg items-center justify-center"
              style={{ backgroundColor: DANGER_500 }}
            >
              <Text className="text-base font-semibold text-white">Delete</Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirmingDelete(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              className="flex-1 h-10 rounded-lg items-center justify-center border border-neutral-200"
            >
              <Text className="text-base text-neutral-600">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
