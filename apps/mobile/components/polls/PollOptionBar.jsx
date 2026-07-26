// PollOptionBar — one horizontal aggregate tally bar (post-vote / closed only).
//
// Visual contract per 05-UI-SPEC.md Screen 4 (State B/C).
//
// Aggregate-only — never a voter name. The count is derived from poll_votes rows by
// the parent (getPollTally / subscribeToVotes), never a denormalized counter.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

const BRAND_500 = "#12715A";
const NEUTRAL_300 = "#d4d4d4";
const NEUTRAL_200 = "#e5e5e5";

/**
 * @param {{
 *   label: string,
 *   count: number,
 *   total: number,
 *   chosen?: boolean,
 * }} props
 */
export function PollOptionBar({ label, count, total, chosen = false }) {
  const { t } = useTranslation("polls");
  // Divide-by-zero guard: percent is 0 when no votes have been cast.
  const safeTotal = total > 0 ? total : 0;
  const percent = safeTotal > 0 ? Math.round((count / safeTotal) * 100) : 0;

  const tallyValue = t("poll.tallyValue", {
    percent: String(percent),
    count: String(count),
  });

  const yourVoteLabel = t("poll.yourVote");
  const a11yLabel = `${label}: ${percent} percent, ${count} votes${chosen ? `, ${yourVoteLabel}` : ""}`;

  return (
    <View className="gap-1" accessibilityRole="text" accessibilityLabel={a11yLabel}>
      {/* Label + tally */}
      <View className="flex-row items-start gap-2">
        <Text className="text-base text-neutral-900 flex-1" numberOfLines={2}>
          {label}
        </Text>
        <Text className="text-sm text-neutral-600">{tallyValue}</Text>
        {chosen ? (
          <View className="flex-row items-center gap-1">
            <Check size={12} color={BRAND_500} />
            <Text className="text-sm" style={{ color: BRAND_500 }}>
              {yourVoteLabel}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Bar — visual only; the data is in the accessibility label above. */}
      <View
        style={{ height: 8, borderRadius: 999, backgroundColor: NEUTRAL_200, overflow: "hidden" }}
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <View
          style={{
            height: 8,
            borderRadius: 999,
            width: `${percent}%`,
            backgroundColor: chosen ? BRAND_500 : NEUTRAL_300,
          }}
        />
      </View>
    </View>
  );
}
