// apps/web/components/dashboard/DashboardTile.jsx
// Web mirror of apps/mobile/components/dashboard/DashboardTile.jsx
// (Phase 04.1 Wave 1, Plan 01).
//
// Same prop contract as mobile. Replaces:
//   - RN Pressable          → semantic <button>
//   - NativeWind classes    → Tailwind v4 utilities
//   - AccessibilityInfo.    → aria-live="polite" sr-only region
//     announceForAccessibility
//   - accessibilityState    → aria-disabled (paired with native `disabled` attr)
//
// "use client" is required because the tile uses an onClick handler.
//
// DT-02 forward-compat: data-driven via the tile config from lib/role-tiles.js.
//
// VISUAL REFRESH — the tile now speaks the Society Green design system:
//   - Colours come from the --color-* CSS variables, not from local hex
//     literals. The old #6e6e6e / #171717 / #f59e0b constants were off-system
//     greys and an off-system amber; they are now neutral-400 / neutral-900 /
//     --color-warning so one token change restyles the whole product.
//   - The icon sits in a tinted "well" (brand-50) instead of floating on the
//     card. `pk-well` inside `pk-tile` makes it answer the card's hover, so the
//     tile reads as one connected object rather than a box with a glyph in it.
//   - `pk-tile` supplies the lift + brand glow on hover, applied ONLY to live
//     tiles, so a disabled tile never moves and never promises a click.
//
// LAYOUT INVARIANTS (asserted by __tests__/responsive-breakpoints.test.jsx —
// do not remove): aspect-square + flex + flex-col on the root, an `mt-auto`
// block pinning the label to the bottom, and `line-clamp-2` on the label so
// long Devanagari labels survive a narrow phone tile.
//
// Accessibility (UI-SPEC §Accessibility, RESEARCH.md Pattern 4):
//   - Placeholders carry BOTH `disabled` (blocks click) AND aria-disabled
//     ("true"). The disabled attribute is the user-agent-level no-op; the
//     aria-disabled keeps the element in the tab order so screen readers
//     announce it. This is "disabled-not-hidden".
//   - announceUnavailable copy is rendered inside an sr-only span with
//     aria-live="polite" so screen readers announce it when the tile gains
//     focus (NVDA / JAWS / VoiceOver all support this).
//   - Focus ring: 2px brand-500 ring on focus-visible.
//
// JavaScript only — no TypeScript per CLAUDE.md.

"use client";

// Design-system tokens. These resolve to Society Green values in globals.css;
// the tile itself no longer hardcodes any colour.
const BRAND_500 = "var(--color-brand-500)";
const NEUTRAL_400 = "var(--color-neutral-400)";
const NEUTRAL_900 = "var(--color-neutral-900)";

/**
 * @param {object} props
 * @param {React.ComponentType<{size: number, color: string}>} props.icon
 *   lucide-react icon component (resolved by caller from a string key in
 *   lib/role-tiles.js).
 * @param {string} props.label
 *   i18n-resolved tile label.
 * @param {() => void} [props.onPress]
 *   Click handler when live. Ignored when placeholder=true.
 * @param {number} [props.badgeCount]
 *   numeric pill when > 0. Renders "99+" if > 99.
 * @param {string} [props.badgeText]
 *   Alternative non-numeric badge text (e.g. "5d"). Priority over badgeCount.
 * @param {boolean} [props.placeholder]
 *   When true: disabled, dimmed, "Coming soon" pill, phase subtitle.
 * @param {string} [props.placeholderPhase]
 *   Subtitle text under the label.
 * @param {string} [props.placeholderPill]
 *   Pill copy (from i18n).
 * @param {string} [props.announceUnavailable]
 *   Copy for the sr-only aria-live region (placeholder only).
 * @param {React.ReactNode} [props.previewNode]
 *   Phase 7 Plan 07-08 — optional preview block rendered below the label for
 *   LIVE tiles only. Placeholder tiles intentionally ignore this prop because
 *   the bottom slot belongs to the "Ships in Phase N" subtitle. Default null
 *   so this prop is purely additive — the tile layout is identical when no
 *   preview is supplied (no shift).
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
  // Determine badge content. Priority: badgeText > badgeCount.
  // Suppressed entirely for placeholders.
  let badgeDisplay = null;
  if (!placeholder) {
    if (badgeText) {
      badgeDisplay = badgeText;
    } else if (badgeCount > 0) {
      badgeDisplay = badgeCount > 99 ? "99+" : String(badgeCount);
    }
  }

  // Compose aria-label — matches mobile's a11yLabel exactly.
  let ariaLabel = label;
  if (placeholder) {
    ariaLabel = placeholderPhase
      ? `${label}. ${placeholderPill}. ${placeholderPhase}.`
      : `${label}. ${placeholderPill}.`;
  } else if (badgeText) {
    ariaLabel = `${label}. ${badgeText}.`;
  } else if (badgeCount > 0) {
    ariaLabel = `${label}. ${badgeCount} pending.`;
  }

  const iconColor = placeholder ? NEUTRAL_400 : BRAND_500;
  const labelColor = placeholder ? NEUTRAL_400 : NEUTRAL_900;

  function handleClick() {
    // Defense in depth: `disabled` attribute already blocks the click event
    // at the user-agent level, but if a caller has somehow bypassed that
    // (e.g. by removing the attribute via dev tools), the early return here
    // still prevents accidental navigation.
    if (placeholder) return;
    onPress?.();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={placeholder}
      aria-disabled={placeholder ? "true" : "false"}
      aria-label={ariaLabel}
      className={[
        // aspect-square + flex + flex-col are layout invariants (see header).
        "group relative flex aspect-square flex-col rounded-[18px] p-4 text-left",
        "border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        placeholder ? "cursor-not-allowed opacity-60" : "pk-tile pk-press cursor-pointer",
      ].join(" ")}
      style={{
        // Inline focus-ring colour so we don't depend on the Tailwind config
        // exposing brand-500 as a ring colour.
        // biome-ignore lint/style/useNamingConvention: CSS custom prop
        "--tw-ring-color": BRAND_500,
        boxShadow: placeholder ? "none" : "0 1px 2px rgba(18,38,28,.05)",
      }}
    >
      {/* sr-only aria-live region — announces placeholder unavailability to
          screen-reader users when the tile receives focus. Sighted users
          never see this. Only present for placeholders that supply announce
          copy. */}
      {placeholder && announceUnavailable ? (
        <span className="sr-only" aria-live="polite">
          {announceUnavailable}
        </span>
      ) : null}

      {/* Top row: icon well + (badge | "Coming soon" pill) */}
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden="true"
          className="pk-well inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
          style={{
            backgroundColor: placeholder ? "var(--color-neutral-100)" : "var(--color-brand-50)",
          }}
        >
          <Icon size={22} color={iconColor} />
        </span>

        {/* Count / "5d" pill. A dark warning fill with white text clears AA at
            this size; the previous light amber + white pairing did not. */}
        {badgeDisplay ? (
          <span
            className="inline-flex min-w-[22px] items-center justify-center rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums text-[var(--color-neutral-0)]"
            style={{ backgroundColor: "var(--color-warning)" }}
          >
            {badgeDisplay}
          </span>
        ) : null}

        {placeholder ? (
          <span className="rounded-full bg-[var(--color-neutral-100)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-neutral-400)]">
            {placeholderPill}
          </span>
        ) : null}
      </div>

      {/* mt-auto pins the label block to the bottom regardless of icon-row
          height variance (layout invariant — see header). */}
      <div className="mt-auto">
        <span
          className="line-clamp-2 block text-[15px] font-bold leading-snug tracking-[-0.01em]"
          style={{ color: labelColor }}
        >
          {label}
        </span>
        {placeholder && placeholderPhase ? (
          <span className="mt-1 line-clamp-2 block text-[13px] text-[var(--color-neutral-400)]">
            {placeholderPhase}
          </span>
        ) : null}
        {!placeholder && previewNode ? previewNode : null}
      </div>
    </button>
  );
}
