"use client";

import {
  formatSocietyCode,
  isValidSocietyCode,
  listSocietyStructure,
  mapSocietyCodeError,
  validateSocietyCode,
} from "@parisar/api-client";
import { Key } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useJoinState } from "../../lib/join-state";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

/**
 * Web Code Entry component.
 *
 * Props:
 *   initialCode — string (from ?code= query param, pre-fills the input)
 *
 * States:
 *   'entry'   — user types code, "Find Society" button below
 *   'preview' — society card shown inline; "Yes, join" / "Wrong society?"
 */
export default function CodeEntry({ initialCode = "" }) {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const joinStore = useJoinState();

  const [rawCode, setRawCode] = useState(initialCode);
  const [mode, setMode] = useState("entry"); // 'entry' | 'preview'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = isValidSocietyCode(rawCode) && !loading;

  /**
   * Auto-insert hyphen after 4 chars.
   * Forces uppercase.
   */
  function handleChange(e) {
    const raw = e.target.value;
    const cleaned = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    let formatted = cleaned;
    if (cleaned.length > 4) {
      formatted = cleaned.slice(0, 4) + "-" + cleaned.slice(4, 8);
    }
    setRawCode(formatted);
    setError(null);
    // If user edits after preview was shown, reset to entry mode
    if (mode === "preview") setMode("entry");
  }

  // PAR-008 fix: the flat "auth" namespace JSON holds the join.*/setup.* keys that
  // mapSocietyCodeError returns, so t() resolves the namespaced dot-key directly.
  // (Old code referenced an unimported `en` → ReferenceError on every join error.)
  function resolveI18nKey(dotKey) {
    return dotKey ? t(dotKey) : t("auth.networkError");
  }

  async function handleFindSociety(e) {
    if (e) e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();

      // 1. Validate code → society preview
      const preview = await validateSocietyCode(supabase, rawCode);
      if (preview.error) {
        setError(resolveI18nKey(mapSocietyCodeError(preview)));
        return;
      }

      // 2. Load wings + flats
      const structure = await listSocietyStructure(supabase, rawCode);
      if (structure && structure.error) {
        setError(resolveI18nKey(mapSocietyCodeError(structure)));
        return;
      }

      // Store in Zustand for use by /join/profile
      joinStore.set({
        code: formatSocietyCode(rawCode),
        society: preview,
        structure,
      });

      setMode("preview");
    } catch {
      setError(t("auth.networkError"));
    } finally {
      setLoading(false);
    }
  }

  function handleConfirmJoin() {
    router.push("/join/profile");
  }

  function handleWrongSociety() {
    joinStore.set({ society: null, structure: null, code: "" });
    setMode("entry");
    setRawCode("");
  }

  const society = joinStore.society;

  // --- Render: society preview ---
  if (mode === "preview" && society) {
    const initials =
      society.name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0] ?? "")
        .join("")
        .toUpperCase() || society.name.slice(0, 2).toUpperCase();

    return (
      <div className="flex flex-col gap-6">
        {/* Society preview card */}
        <div className="bg-[var(--color-neutral-0)] rounded-2xl p-6 shadow-sm flex flex-col items-center gap-4">
          {/* Initials circle */}
          <div
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--color-brand-500)" }}
          >
            <span className="text-[28px] font-semibold text-white">{initials}</span>
          </div>

          {/* Name */}
          <h2 className="text-xl font-semibold text-[var(--color-neutral-900)] text-center">
            {society.name}
          </h2>

          {/* Address */}
          <p className="text-base text-[var(--color-neutral-600)] text-center">{society.address}</p>

          {/* Member count */}
          <p className="text-sm text-[var(--color-neutral-400)]">
            {(t("join.previewMemberCount") ?? "").replace(
              "{{count}}",
              String(society.member_count ?? 0),
            )}
          </p>

          {/* Divider */}
          <div className="w-full h-px bg-[var(--color-neutral-200)]" />

          {/* Confirm copy */}
          <p className="text-base text-[var(--color-neutral-900)] text-center">
            {(t("join.confirmJoin") ?? "").replace("{{societyName}}", society.name)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleConfirmJoin}
            className="h-12 w-full rounded-xl font-semibold text-white text-base transition-colors"
            style={{ backgroundColor: "var(--color-brand-500)" }}
          >
            {t("join.confirmYes")}
          </button>
          <button
            onClick={handleWrongSociety}
            className="text-sm text-[var(--color-neutral-600)] underline-offset-2 hover:underline py-2"
          >
            {t("join.wrongSociety")}
          </button>
        </div>
      </div>
    );
  }

  // --- Render: code entry form ---
  return (
    <form onSubmit={handleFindSociety} className="flex flex-col gap-6">
      {/* Icon + heading */}
      <div className="flex flex-col items-center gap-3">
        <Key size={48} color="var(--color-brand-500)" />
        <h1 className="text-[28px] font-semibold text-[var(--color-neutral-900)] text-center leading-tight">
          {t("join.heading")}
        </h1>
        <p className="text-base text-[var(--color-neutral-600)] text-center leading-relaxed">
          {t("join.body")}
        </p>
      </div>

      {/* Code input */}
      <div className="flex flex-col gap-2">
        <label htmlFor="society-code" className="text-sm text-[var(--color-neutral-600)]">
          {t("join.codeLabel")}
        </label>
        <input
          id="society-code"
          type="text"
          value={rawCode}
          onChange={handleChange}
          placeholder="XXXX-XXXX"
          maxLength={9}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          style={{
            height: 64,
            fontFamily: "monospace",
            fontSize: 28,
            fontWeight: "600",
            letterSpacing: 8,
            borderWidth: 1.5,
            borderColor: "var(--color-neutral-200)",
            borderRadius: 12,
            paddingLeft: 12,
            paddingRight: 12,
            backgroundColor: "var(--color-neutral-0)",
            color: "var(--color-neutral-900)",
            textTransform: "uppercase",
            outline: "none",
            width: "100%",
            boxSizing: "border-box",
          }}
          className="focus:border-[var(--color-brand-700)] focus:ring-2 focus:ring-[var(--color-brand-700)]/20 transition-colors"
          aria-label={t("join.codeLabel")}
          onFocus={(e) => {
            e.target.style.borderColor = "var(--color-brand-700)";
            e.target.style.boxShadow = "0 0 0 2px rgba(91,108,255,0.2)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "var(--color-neutral-200)";
            e.target.style.boxShadow = "none";
          }}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {/* Find Society button */}
      <button
        type="submit"
        disabled={!canSubmit}
        className={[
          "h-12 w-full rounded-xl font-semibold text-base transition-colors",
          canSubmit
            ? "text-white hover:opacity-90"
            : "text-[var(--color-neutral-400)] cursor-not-allowed",
        ].join(" ")}
        style={{
          backgroundColor: canSubmit ? "var(--color-brand-500)" : "var(--color-neutral-200)",
        }}
      >
        {loading ? t("join.lookingUp") : t("join.findSociety")}
      </button>
    </form>
  );
}
