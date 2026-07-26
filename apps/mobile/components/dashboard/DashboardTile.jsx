// apps/mobile/components/dashboard/DashboardTile.jsx
// Reusable tile for the Home card grid (Phase 04.1 Wave 1).
//
// Three variants driven by props (UI-SPEC §Tile Color Contract):
//   1. Live, no badge       — icon brand-500, label neutral-900, tap to navigate
//   2. Live, with badge     — same + warning-500 numeric pill top-right
//   3. Placeholder          — disabled, 50% opacity, "Coming soon" pill,
//                             "Ships in Phase N" subtitle
//
// DT-02 forward-compat (locked): the component is data-driven via the tile
// config shape from lib/role-tiles.js. Phase 5+ activates a placeholder by
// flipping `live: false → true` in that file — this component does NOT
// special-case any specific tile by key.
//
// DT-03 distinction: tiles use rounded-2xl. ComplaintCard uses rounded-xl.
// The rounder tile reads as a tactile, glanceable surface vs. data-row cards.
//
// Locked color tokens (UI-SPEC §Color > Tile Color Contract; do NOT change):
//   - Live icon: #12715A (brand.500)
//   - Placeholder icon: #6e6e6e (neutral.400)
//   - Badge: bg #f59e0b (warning.500), text #ffffff, text-xs font-semibold
//   - "Coming soon" pill: bg #f5f5f5 (neutral.100), text #525252 (neutral.600)
//   - Tile: rounded-2xl, border-neutral-200, bg-white, aspect-square
//   - Label: numberOfLines={2} (Pitfall 6 Devanagari — `सदस्य निर्देशिका`
//     wraps to 2 lines without breaking the grid)
//
// Accessibility (UI-SPEC §Accessibility, RESEARCH.md Pattern 4):
//   - accessibilityState.disabled MUST be set explicitly (RN does not auto-sync
//     from the `disabled` prop on Pressable)
//   - NEVER set pointer-events to none on a placeholder — that would hide it
//     from the screen reader entirely, defeating the "disabled-not-hidden"
//     rule. We keep the Pressable interactive and no-op the navigation branch
//     for placeholders so screen readers still announce the tile on focus.
//   - On placeholder press: AccessibilityInfo.announceForAccessibility delivers
//     audible feedback to TalkBack/VoiceOver users without navigating
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { AccessibilityInfo, Pressable, Text, View } from "react-native";

// Locked design tokens — these are the only places these hex literals appear
// in this file. UI-SPEC §Tile Color Contract is the source of truth.
const BRAND_500 = "#12715A";
const NEUTRAL_400 = "#6e6e6e";
const NEUTRAL_900 = "#171717";
const WARNING_500 = "#f59e0b";

/**
 * @typedef {object} DashboardTileProps
 * @property {React.ComponentType<{size: number, color: string}>} icon
 *   lucide-react-native icon component (resolved by caller from a string key
 *   stored in lib/role-tiles.js).
 * @property {string} label
 *   i18n-resolved tile label (e.g. "Member Directory", "सदस्य निर्देशिका").
 * @property {() => void} [onPress]
 *   Tap handler when live. Ignored entirely when placeholder=true.
 * @property {number} [badgeCount]
 *   warning-500 numeric pill when > 0. Renders "99+" if > 99.
 * @property {string} [badgeText]
 *   Alternative non-numeric badge text (e.g. "5d" for code rotation days).
 *   Takes priority over badgeCount when both supplied.
 * @property {boolean} [placeholder]
 *   When true: disabled, 50% opacity, "Coming soon" pill, phase subtitle.
 * @property {string} [placeholderPhase]
 *   Subtitle text under the label, e.g. "Ships in Phase 5".
 * @property {string} [placeholderPill]
 *   Pill copy, e.g. "Coming soon" (from i18n).
 * @property {string} [announceUnavailable]
 *   Screen-reader announcement on placeholder press,
 *   e.g. "Coming soon. This feature ships in Phase 5."
 * @property {React.ReactNode} [previewNode]
 *   Optional preview slot rendered below the label (UI-SPEC §Screen 1, D-04).
 *   Phase 7 wires this with DashboardTilePreview so live tiles can show
 *   "All clear" / skeleton / up to 2 row previews. Pass null (or omit) for
 *   placeholder tiles — they keep the "Ships in Phase N" subtitle in this slot.
 *
 * @param {DashboardTileProps} props
 */
export function DashboardTile({
  icon: Icon,
  label,
  onPress,
  badgeCount = 0,
  badgeText,
  placeholder = false,
  placeholderPhase = null,
  placeholderPill = "Coming soon",
  announceUnavailable = null,
  previewNode = null,
}) {
  function handlePress() {
    if (placeholder) {
      if (announceUnavailable) {
        try {
          AccessibilityInfo.announceForAccessibility(announceUnavailable);
        } catch {
          // Non-fatal: announceForAccessibility is fire-and-forget; if the
          // platform rejects, the user has still learned via the visual
          // dimming + "Coming soon" pill that the tile is unavailable.
        }
      }
      return;
    }
    onPress?.();
  }

  // Determine badge content. Priority: badgeText > badgeCount.
  // Suppressed entirely for placeholders (they render the "Coming soon" pill
  // in the same top-right slot).
  let badgeDisplay = null;
  if (!placeholder) {
    if (badgeText) {
      badgeDisplay = badgeText;
    } else if (badgeCount > 0) {
      badgeDisplay = badgeCount > 99 ? "99+" : String(badgeCount);
    }
  }

  // Compose accessibilityLabel — sighted users see icon + label + pill;
  // screen-reader users need the same information audibly.
  let a11yLabel = label;
  if (placeholder) {
    a11yLabel = placeholderPhase
      ? `${label}. ${placeholderPill}. ${placeholderPhase}.`
      : `${label}. ${placeholderPill}.`;
  } else if (badgeText) {
    a11yLabel = `${label}. ${badgeText}.`;
  } else if (badgeCount > 0) {
    a11yLabel = `${label}. ${badgeCount} pending.`;
  }

  const iconColor = placeholder ? NEUTRAL_400 : BRAND_500;
  const labelColor = placeholder ? NEUTRAL_400 : NEUTRAL_900;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      // Mark disabled for the a11y tree explicitly. We deliberately do NOT
      // pass the `disabled` prop on Pressable — that would suppress onPress
      // entirely, which means TalkBack/VoiceOver users would never hear the
      // announceUnavailable feedback on tap. Our handlePress no-ops the
      // navigation branch for placeholders, so we get the right behavior:
      // sighted users see no UI change, screen-reader users get audible
      // confirmation that the feature is unavailable. Per RESEARCH.md
      // Pattern 4 ("disabled-not-hidden").
      accessibilityState={{ disabled: placeholder }}
      accessibilityLabel={a11yLabel}
      className={[
        "flex-1 min-w-[45%] aspect-square bg-white rounded-2xl p-4 border border-neutral-200",
        placeholder ? "opacity-50" : "active:bg-brand-50 active:scale-95",
      ].join(" ")}
      style={placeholder ? { opacity: 0.5 } : undefined}
    >
      {/* Top row: icon + (badge | "Coming soon" pill) */}
      <View className="flex-row items-start justify-between">
        <Icon size={24} color={iconColor} />

        {badgeDisplay ? (
          <View
            className="rounded-full px-2 py-0.5 min-w-[20px] items-center justify-center"
            style={{ backgroundColor: WARNING_500 }}
          >
            {/* PAR-066: white on amber was 2.15:1 — amber needs DARK text (8.35:1). */}
            <Text className="text-xs font-semibold text-[#171717]">{badgeDisplay}</Text>
          </View>
        ) : null}

        {placeholder ? (
          <View className="bg-neutral-100 rounded-full px-2 py-0.5">
            <Text className="text-xs text-neutral-600">{placeholderPill}</Text>
          </View>
        ) : null}
      </View>

      {/* Bottom block: label + (optional placeholderPhase subtitle) +
          (optional previewNode slot for live tiles, Phase 7 D-04).
          mt-auto pins this to the bottom of the aspect-square tile so labels
          align across the grid regardless of icon-row height variance. */}
      <View className="mt-auto">
        <Text className="text-base font-medium" style={{ color: labelColor }} numberOfLines={2}>
          {label}
        </Text>
        {placeholder && placeholderPhase ? (
          <Text className="text-sm text-neutral-400 mt-1" numberOfLines={2}>
            {placeholderPhase}
          </Text>
        ) : null}
        {/* Phase 7 D-04 — preview slot. Rendered only for live tiles (callers
            pass null for placeholders). DashboardTilePreview owns its own
            loading / empty / row-list / silent-omission states + the
            accessibilityElementsHidden a11y contract (T-07-28). */}
        {!placeholder && previewNode ? previewNode : null}
      </View>
    </Pressable>
  );
}
