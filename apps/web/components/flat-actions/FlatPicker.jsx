"use client";

// FlatPicker (web) — wing-grouped flat selection via shadcn Select. UI-SPEC Screen 1
// (issue form required picker) + Screen 3 (board filter with an "All flats" row).
// Mirrors the AmenityPicker (Phase 5) Select pattern.
//
// Two modes:
//   - Required picker (Issue form): no "All flats" option; parent gates Submit on a value.
//   - Filter (board view): pass `allowAll` → prepend an "All flats" row (value "" →
//     onSelect(null)).
//
// Empty case (no flats — impossible post-setup): disabled with an inline note.

import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

const ALL_VALUE = "__all__";

/**
 * "{wing}-{number}" label for a flat. Falls back to the number, then "—".
 * @param {{ number?: string, wing?: { name?: string }|null }} flat
 */
export function formatFlatLabel(flat) {
  if (!flat) return "—";
  const wing = flat?.wing?.name ?? "";
  const num = flat?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

/**
 * @param {{
 *   flats: Array<{ id: string, number?: string, wing?: { name?: string }|null }>,
 *   selectedId?: string|null,
 *   onSelect: (flat: object|null) => void,
 *   label?: string,
 *   allowAll?: boolean,
 *   allLabel?: string,
 *   id?: string,
 * }} props
 */
export function FlatPicker({
  flats = [],
  selectedId = null,
  onSelect,
  label = null,
  allowAll = false,
  allLabel = "All flats",
  id = "flat-picker",
}) {
  const { t } = useTranslation("flat-actions");
  // PAR-001 fix: t() cannot be a default-param value (TDZ — `t` isn't initialized
  // until this line); resolve the fallback label inside the body instead.
  const resolvedLabel = label ?? t("flatAction.flatLabel");
  const isEmpty = flats.length === 0;

  function handleChange(value) {
    if (value === ALL_VALUE) {
      onSelect?.(null);
      return;
    }
    const flat = flats.find((f) => f.id === value) ?? null;
    onSelect?.(flat);
  }

  const value = allowAll && !selectedId ? ALL_VALUE : (selectedId ?? "");

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-[#525252]">
        {resolvedLabel}
      </label>
      {isEmpty ? (
        <p className="text-sm text-[#6e6e6e]">{t("flatAction.noFlats")}</p>
      ) : (
        <Select value={value || undefined} onValueChange={handleChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={allowAll ? allLabel : resolvedLabel} />
          </SelectTrigger>
          <SelectContent>
            {allowAll ? <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem> : null}
            {flats.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {formatFlatLabel(f)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
