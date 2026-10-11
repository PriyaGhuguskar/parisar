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
const DEBOUNCE_MS = 400;
const SAVED_FLASH_MS = 1500;

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

  // Per-key debounce timers, the "Saved" flash timer, and the last values the
  // server confirmed (the rollback target — NOT the previous keystroke).
  const timers = useRef({});
  const flashTimerRef = useRef(null);
  const savedRef = useRef(null);
  if (savedRef.current === null) savedRef.current = state;

  // Debounced write (400ms per key, DD-7). Optimistic: state is already updated;
  // on failure revert that key to its last confirmed value — unless a newer edit
  // for the same key is already queued (that edit will retry the save).
  const persist = useCallback(
    (key, value) => {
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(async () => {
        delete timers.current[key];
        setSaveError(false);
        let ok = false;
        try {
          const result = await updatePreferenceAction(societyId, { [key]: value });
          ok = !!result?.ok;
        } catch {
          ok = false;
        }
        if (ok) {
          savedRef.current = { ...savedRef.current, [key]: value };
          setSavedFlash(true);
          clearTimeout(flashTimerRef.current);
          flashTimerRef.current = setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
          return;
        }
        if (!timers.current[key]) {
          setState((s) => ({ ...s, [key]: savedRef.current[key] }));
        }
        setSaveError(true);
      }, DEBOUNCE_MS);
    },
    [societyId],
  );

  // Clear timers on unmount.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of Object.values(pending)) clearTimeout(id);
      clearTimeout(flashTimerRef.current);
    };
  }, []);

  // State update and the side effect are separate — persist() never runs inside
  // a setState updater (updaters must be pure; StrictMode calls them twice).
  function setField(key, value) {
    setState((s) => ({ ...s, [key]: value }));
    persist(key, value);
  }

  function toggleMute(col, receivingChecked) {
    // Inverted (DD-11): switch ON = receiving → mute = !checked.
    setField(col, !receivingChecked);
  }

  function updateQuiet(field, value) {
    setField(field, value);
  }

  function updateCap(value) {
    const num = Number.parseInt(value, 10);
    if (Number.isNaN(num)) return;
    setField("cap_per_day", num);
  }

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
                className={`flex items-center gap-3 min-h-14 ${
                  idx < MUTE_ROWS.length - 1 ? "border-b border-neutral-100" : ""
                }`}
              >
                <Icon size={20} color="#525252" aria-hidden="true" />
                <span id={`mute-label-${col}`} className="flex-1 text-base text-[#171717]">
                  {t(`prefs.cat.${labelKey}`)}
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
          <SelectTrigger className="w-full max-w-50">
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
