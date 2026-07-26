// NoticeCard — list row for a single society notice.
//
// Visual contract per 05-UI-SPEC.md Screen 1 (NoticeCard spec):
//   - Surface: bg-white / rounded-xl / 1px neutral.200 border / p-4
//   - NO left status stripe (DD-12) — distinguishes notices from complaints.
//   - 8px brand.500 unread dot top-left when unread; read → no dot + title neutral-600.
//   - Title numberOfLines={1} Heading 20/600.
//   - Body preview numberOfLines={2} Body 16/400 (neutral.900 unread / neutral.600 read).
//   - Right-aligned age via date-fns formatDistanceToNow.
//   - AttachmentPill when an attachment exists.
//   - PollPill (brand.50 / brand.500, BarChart3 12px, "Poll · {{count}} options")
//     when a poll is present, with a brand.500 vote-pending dot when open + not voted.
//   - OwnerChip reused verbatim with the notice.postedBy label (NOTF-04).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { formatDistanceToNow } from "date-fns";
import { BarChart3 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { OwnerChip } from "../complaints/OwnerChip";
import { AttachmentPill } from "./AttachmentPill";

const BRAND_500 = "#12715A";

function formatFlat(authorFlat) {
  if (!authorFlat) return "—";
  const wing = authorFlat?.wing?.name ?? "";
  const num = authorFlat?.number ?? "";
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

// The list query left-joins `polls` as an array; normalize to the single poll (0..1).
function firstPoll(notice) {
  const polls = notice?.polls;
  if (Array.isArray(polls)) return polls[0] ?? null;
  // getNoticeDetail returns a single object on `poll`; tolerate both shapes.
  return polls ?? null;
}

/**
 * PollPill — small "Poll · N options" chip with an optional vote-pending dot.
 * Option count is unknown in the list query (only id/question/status are embedded),
 * so we render the localized hint without a number when count is unavailable.
 */
function PollPill({ poll, voted, t, tPoll }) {
  const open = poll?.status === "open";
  const showPendingDot = open && !voted;
  // The list query doesn't embed the option labels; the hint reads generically.
  const hint = tPoll("poll.listTitle"); // fallback label "Polls" if no count
  const pollHint = t("notice.pollHint");
  const label = pollHint.includes("{{count}}")
    ? t("notice.pollHint", { count: poll?.optionCount ?? "" })
    : hint;

  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
      style={{ alignSelf: "flex-start", backgroundColor: "#f5f7ff" }}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <BarChart3 size={12} color={BRAND_500} />
      <Text className="text-sm" style={{ color: BRAND_500 }} numberOfLines={1}>
        {label.trim()}
      </Text>
      {showPendingDot ? (
        <View
          style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND_500 }}
          accessibilityElementsHidden
        />
      ) : null}
    </View>
  );
}

/**
 * @param {{
 *   notice: object,
 *   onPress: (notice: object) => void,
 *   unread?: boolean,
 *   hasAttachment?: boolean,
 *   attachmentMime?: string|null,
 *   voted?: boolean,
 * }} props
 */
export function NoticeCard({
  notice,
  onPress,
  unread = true,
  hasAttachment = false,
  attachmentMime = null,
  voted = false,
}) {
  const { t } = useTranslation("notifications");
  const { t: tPoll } = useTranslation("polls");
  const poll = firstPoll(notice);
  const authorName = notice?.author?.full_name ?? "—";
  const authorFlat = formatFlat(notice?.author_flat);
  const age = safeAge(notice?.created_at);

  const postedByText = t("notice.postedBy", { name: authorName, flat: authorFlat });

  const titleColor = unread ? "text-neutral-900" : "text-neutral-600";
  const bodyColor = unread ? "text-neutral-900" : "text-neutral-600";

  const a11yLabel = `${unread ? "Unread notice" : "Notice"}: ${notice?.title ?? ""}`;

  return (
    <Pressable
      onPress={() => onPress?.(notice)}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      className="bg-white rounded-xl border border-neutral-200 p-4"
    >
      <View className="flex-row gap-2">
        {/* Unread dot — 8px brand.500, top-left, only when unread (NO left stripe, DD-12) */}
        {unread ? (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: BRAND_500,
              marginTop: 6,
            }}
            accessibilityElementsHidden
            accessible={false}
          />
        ) : null}

        <View className="flex-1 gap-2">
          {/* Title + age */}
          <View className="flex-row items-start gap-2">
            <Text className={`text-xl font-semibold flex-1 ${titleColor}`} numberOfLines={1}>
              {notice?.title ?? ""}
            </Text>
            {age ? (
              <Text className="text-sm text-neutral-400" numberOfLines={1}>
                {age}
              </Text>
            ) : null}
          </View>

          {/* Body preview — 2 lines */}
          {notice?.body ? (
            <Text className={`text-base ${bodyColor}`} numberOfLines={2}>
              {notice.body}
            </Text>
          ) : null}

          {/* Chip row — attachment + poll */}
          {hasAttachment || poll ? (
            <View className="flex-row flex-wrap items-center gap-2">
              {hasAttachment ? <AttachmentPill mimeType={attachmentMime} /> : null}
              {poll ? <PollPill poll={poll} voted={voted} t={t} tPoll={tPoll} /> : null}
            </View>
          ) : null}

          {/* Attribution (NOTF-04) — reuse OwnerChip with the notice.postedBy label */}
          <OwnerChip ownerName={postedByText} ownerFlat={null} label={postedByText} />
        </View>
      </View>
    </Pressable>
  );
}
