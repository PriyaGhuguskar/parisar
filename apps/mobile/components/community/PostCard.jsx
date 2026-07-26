// PostCard — community feed row (NoticeCard / ComplaintCard token clone).
//
// Visual contract per 06-UI-SPEC.md Screen 4 §PostCard.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { formatDistanceToNow } from "date-fns";
import { Flag, MessageCircle, MoreVertical, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { OwnerChip } from "../complaints/OwnerChip";
import { PhotoGrid } from "./PhotoGrid";
import { PostTypeChip } from "./PostTypeChip";

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
 *   post: object,
 *   onPress?: (post: object) => void,
 *   onReport?: (post: object) => void,
 *   onDelete?: (post: object) => void,
 *   currentUserId?: string|null,
 *   supabase?: object,
 *   attachments?: Array,
 *   numberOfBodyLines?: number,
 * }} props
 */
export function PostCard({
  post,
  onPress,
  onReport,
  onDelete,
  currentUserId = null,
  supabase,
  attachments = [],
  numberOfBodyLines = 3,
}) {
  const { t } = useTranslation("community");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const kind = post?.kind ?? "general";
  const authorName = post?.author?.full_name ?? "—";
  const authorFlat = formatFlat(post?.author_flat);
  const postedByLabel = t("community.postedBy", { name: authorName, flat: authorFlat });

  const age = safeAge(post?.created_at);
  const isAuthor = !!currentUserId && post?.author_id === currentUserId;

  // comment_count comes back as [{ count }] from the embed.
  const commentCount = Array.isArray(post?.comment_count)
    ? (post.comment_count[0]?.count ?? 0)
    : (post?.comment_count ?? 0);

  const commentCountLabel = t("community.commentCount", { n: String(commentCount) });

  return (
    <View className="bg-white rounded-xl border border-neutral-200 p-4 gap-2">
      {/* Top row: type chip + age + report/overflow */}
      <View className="flex-row items-center gap-2">
        <PostTypeChip kind={kind} />
        {age ? (
          <Text className="text-sm text-neutral-400 ml-auto" numberOfLines={1}>
            {age}
          </Text>
        ) : (
          <View className="ml-auto" />
        )}

        {isAuthor ? (
          <Pressable
            onPress={() => setMenuOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="Post options"
            className="p-1"
          >
            <MoreVertical size={18} color={NEUTRAL_400} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => onReport?.(post)}
            accessibilityRole="button"
            accessibilityLabel={t("community.reportConfirm")}
            className="p-1"
          >
            <Flag size={16} color={NEUTRAL_400} />
          </Pressable>
        )}
      </View>

      {/* Author attribution */}
      <OwnerChip label={postedByLabel} />

      {/* Body (tap → detail) */}
      <Pressable
        onPress={() => onPress?.(post)}
        accessibilityRole="button"
        accessibilityLabel={post?.body ?? ""}
      >
        <Text className="text-base text-neutral-900" numberOfLines={numberOfBodyLines}>
          {post?.body ?? ""}
        </Text>
      </Pressable>

      {/* Photos (only when attachments are provided — feed cards usually omit) */}
      {attachments && attachments.length > 0 ? (
        <PhotoGrid attachments={attachments} supabase={supabase} />
      ) : null}

      {/* Comment count (tap → detail) */}
      <Pressable
        onPress={() => onPress?.(post)}
        accessibilityRole="button"
        accessibilityLabel={commentCountLabel}
        className="flex-row items-center gap-1 mt-1"
      >
        <MessageCircle size={14} color="#525252" />
        <Text className="text-sm text-neutral-600">{commentCountLabel}</Text>
      </Pressable>

      {/* Author overflow menu: Delete-own (inline confirm) */}
      {isAuthor && menuOpen ? (
        <View className="gap-2 mt-1 border-t border-neutral-100 pt-2">
          {confirmingDelete ? (
            <View className="gap-2">
              <Text className="text-sm text-neutral-600">{t("community.deleteConfirm")}</Text>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => {
                    setMenuOpen(false);
                    setConfirmingDelete(false);
                    onDelete?.(post);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t("community.deleteConfirm")}
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
          ) : (
            <Pressable
              onPress={() => setConfirmingDelete(true)}
              accessibilityRole="button"
              accessibilityLabel="Delete post"
              className="flex-row items-center gap-2 py-1"
            >
              <Trash2 size={16} color={DANGER_500} />
              <Text className="text-base" style={{ color: DANGER_500 }}>
                Delete post
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}
