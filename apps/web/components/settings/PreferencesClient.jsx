"use client";

// PreferencesClient — notification preferences surface (web). UI-SPEC Screen 7.
//
// Section 1 — Mute by category: 5 shadcn Switch rows with INVERTED semantics
//   (DD-11): the switch shows "notifications ON" → checked = !mute_x; toggling OFF
//   persists mute_x = true. Each write is debounced 400ms (DD-7) — optimistic local
//   state with a revert on failure (the one place optimistic UI is allowed). An
//   allMuted info banner appears when all 5 are muted.
// Section 2 — Quiet hours: two time inputs (default 22:00 → 07:00) + quietWrapNote;
//   debounced.
// Section 3 — Daily limit: a Select (10/20/30/50/Unlimited); debounced.
//
// "Saved" inline confirm per successful write; revert + saveError on failure.
// All writes go through updatePreferenceAction (scoped to the session user, T-05-07).

import {
  AlertCircle,
  BarChart3,
  Bell,
  Check,
  Info,
  MessageSquareWarning,
  Users2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { updatePreferenceAction } from "../../app/actions/preferences";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";

const MUTE_ROWS = [
  { col: "mute_complaints", labelKey: "complaints", Icon: MessageSquareWarning },
  { col: "mute_polls", labelKey: "polls", Icon: BarChart3 },
  { col: "mute_community", labelKey: "community", Icon: Users2 },
  { col: "mute_fines", labelKey: "fines", Icon: AlertCircle },
  { col: "mute_general", labelKey: "general", Icon: Bell },
];

// NOTE: no "0 = unlimited" option. The eligible_push_recipients() helper uses
// `count(*) < cap_per_day`, so cap_per_day=0 would silently mute ALL push. Until
// the helper treats 0 as unlimited, the web cap mirrors mobile (minimum 10/day).
const CAP_OPTIONS = [10, 20, 30, 50];
const DEFAULTS = {
  mute_complaints: false,
  mute_polls: false,
  mute_community: false,
  mute_fines: false,
  mute_general: false,
  quiet_start: "22:00",
  quiet_end: "07:00",
  cap_per_day: 20,
};

function hhmm(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

/**
 * @param {{ societyId: string, initialPrefs: object|null }} props
 */
export function PreferencesClient({ societyId, initialPrefs }) {
  const { t } = useTranslation("preferences");
  const seed = { ...DEFAULTS, ...(initialPrefs ?? {}) };
  const [state, setState] = useState({
    mute_complaints: !!seed.mute_complaints,
    mute_polls: !!seed.mute_polls,
    mute_community: !!seed.mute_community,
    mute_fines: !!seed.mute_fines,
    mute_general: !!seed.mute_general,
    quiet_start: hhmm(seed.quiet_start) || "22:00",
    quiet_end: hhmm(seed.quiet_end) || "07:00",
    cap_per_day: seed.cap_per_day ?? 20,
  });
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const timers = useRef({});

  // Debounced write (400ms per key, DD-7). Optimistic: state already updated;
  // revert the patched keys on failure.
  const persist = useCallback(
    (patch, prevSnapshot) => {
      const key = Object.keys(patch).join(",");
      if (timers.current[key]) clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(async () => {
        setSaveError(false);
        const result = await updatePreferenceAction(societyId, patch);
        if (result.ok) {
          setSavedFlash(true);
          setTimeout(() => setSavedFlash(false), 1500);
        } else {
          // Revert the optimistic change.
          setState((s) => ({ ...s, ...prevSnapshot }));
          setSaveError(true);
        }
      }, 400);
    },
    [societyId],
  );

  // Clear timers on unmount.
  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const id of Object.values(t)) clearTimeout(id);
    };
  }, []);

  function toggleMute(col, receivingChecked) {
    // Inverted (DD-11): switch ON = receiving → mute = !checked.
    const nextMuted = !receivingChecked;
    setState((s) => {
      const prevSnapshot = { [col]: s[col] };
      const next = { ...s, [col]: nextMuted };
      persist({ [col]: nextMuted }, prevSnapshot);
      return next;
    });
  }

  function updateQuiet(field, value) {
    setState((s) => {
      const prevSnapshot = { [field]: s[field] };
      const next = { ...s, [field]: value };
      persist({ [field]: value }, prevSnapshot);
      return next;
    });
  }

  function updateCap(value) {
    const num = Number.parseInt(value, 10);
    setState((s) => {
      const prevSnapshot = { cap_per_day: s.cap_per_day };
      const next = { ...s, cap_per_day: num };
      persist({ cap_per_day: num }, prevSnapshot);
      return next;
    });
  }

  const allMuted = MUTE_ROWS.every((r) => state[r.col]);

  return (
    <div className="flex flex-col gap-4">
      {allMuted ? (
        <div className="flex items-center gap-2 rounded-xl bg-[#f5f7ff] text-[#0E5A48] p-3">
          <Info size={16} aria-hidden="true" />
          <p className="text-sm">{t("prefs.allMutedNote")}</p>
        </div>
      ) : null}

      {saveError ? (
        <p role="alert" className="text-sm text-[#c81e1e]">
          {t("prefs.saveError")}
        </p>
      ) : null}

      {/* Section 1 — Mute by category */}
      <section className="bg-white rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold text-[#171717]">{t("prefs.muteHeading")}</h2>
          {savedFlash ? <SavedFlash /> : null}
        </div>
        <p className="text-base text-[#525252]">{t("prefs.muteSubhead")}</p>

        <div className="flex flex-col">
          {MUTE_ROWS.map(({ col, labelKey, Icon }, idx) => {
            const receiving = !state[col];
            return (
              <div
                key={col}
                className={`flex items-center gap-3 min-h-[56px] ${
                  idx < MUTE_ROWS.length - 1 ? "border-b border-neutral-100" : ""
                }`}
              >
                <Icon size={20} color="#525252" aria-hidden="true" />
                <span id={`mute-label-${col}`} className="flex-1 text-base text-[#171717]">
                  {t("prefs.cat")[labelKey]}
                </span>
                <Switch
                  checked={receiving}
                  onCheckedChange={(checked) => toggleMute(col, checked)}
                  aria-labelledby={`mute-label-${col}`}
                  aria-checked={receiving}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 2 — Quiet hours */}
      <section className="bg-white rounded-xl p-4 flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-[#171717]">{t("prefs.quietHeading")}</h2>
        <p className="text-base text-[#525252]">{t("prefs.quietSubhead")}</p>
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label htmlFor="quiet-from" className="text-sm text-[#525252]">
              {t("prefs.quietFrom")}
            </label>
            <input
              id="quiet-from"
              type="time"
              value={state.quiet_start}
              onChange={(e) => updateQuiet("quiet_start", e.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-3 h-11 text-base text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#12715A]"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label htmlFor="quiet-to" className="text-sm text-[#525252]">
              {t("prefs.quietTo")}
            </label>
            <input
              id="quiet-to"
              type="time"
              value={state.quiet_end}
              onChange={(e) => updateQuiet("quiet_end", e.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-3 h-11 text-base text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#12715A]"
            />
          </div>
        </div>
        <p className="text-sm text-[#6e6e6e]">{t("prefs.quietWrapNote")}</p>
      </section>

      {/* Section 3 — Daily limit */}
      <section className="bg-white rounded-xl p-4 flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-[#171717]">{t("prefs.capHeading")}</h2>
        <p className="text-base text-[#525252]">{t("prefs.capSubhead")}</p>
        <Select value={String(state.cap_per_day)} onValueChange={updateCap}>
          <SelectTrigger className="w-full max-w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CAP_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n === 0
                  ? t("prefs.capUnlimited")
                  : t("prefs.capValue").replace("{{n}}", String(n))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>
    </div>
  );
}

function SavedFlash() {
  const { t } = useTranslation("preferences");
  return (
    <span className="inline-flex items-center gap-1 text-sm text-[#047857]">
      <Check size={12} aria-hidden="true" />
      {t("prefs.saved")}
    </span>
  );
}
