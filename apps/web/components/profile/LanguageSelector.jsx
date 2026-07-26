// apps/web/components/profile/LanguageSelector.jsx
// Phase 7 — Plan 07-04 Task 2 (L10N-04, UI-SPEC §Screen 4 Web).
//
// shadcn Dialog with 3 buttons (English / हिन्दी / मराठी). On select:
//   1. setLanguageAction(lng) writes the parisar_lang cookie (server)
//   2. i18n.changeLanguage(lng) flips the live client instance
//   3. router.refresh() re-fetches every RSC page in the new language
//   4. dialog closes
//
// UI-SPEC §Typography lines 249-253: every row label MUST resolve the bundled
// Noto Sans Devanagari font. The `<html>` element from layout.jsx wires the
// `--font-noto-devanagari` CSS variable; the inline style below sets that
// variable as the FIRST choice on the row label span so हिन्दी / मराठी never
// fall through to the device-default font on budget Android browsers
// (the entire reason L10N-03 exists).

"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { setLanguageAction } from "@/app/actions/set-language";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Explicit per-row literal `t(...)` calls below (instead of a labelKey indirection)
// keep the keys grep-discoverable for the i18n-coverage CI gate AND for the
// Plan 07-04 acceptance criteria check.
const OPTIONS = [
  { lng: "en", labelKey: "language.english" },
  { lng: "hi", labelKey: "language.hindi" },
  { lng: "mr", labelKey: "language.marathi" },
];

// UI-SPEC §Typography lines 249-253 — explicit font-family declaration on the
// row label span. The CSS variable falls back to the bundled Noto Sans Devanagari
// font wired in apps/web/app/layout.jsx; if the variable is unresolved (JSDOM
// in tests, or a misconfigured build), the literal "Noto Sans Devanagari"
// family name is the second fallback so the contract still holds.
const ROW_LABEL_FONT_FAMILY =
  "var(--font-noto-devanagari), var(--font-noto-sans), 'Noto Sans Devanagari', sans-serif";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 */
export function LanguageSelector({ open, onOpenChange }) {
  const { t, i18n } = useTranslation("dashboard");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorKey, setErrorKey] = useState(null);
  const active = i18n.language;

  const handleSelect = (lng) => {
    setErrorKey(null);
    startTransition(async () => {
      try {
        await setLanguageAction(lng);
        await i18n.changeLanguage(lng); // immediate client update
        router.refresh();
        onOpenChange(false);
      } catch (_e) {
        setErrorKey("language.saveError");
      }
    });
  };

  // Explicit per-locale `t()` calls so the literal key strings are
  // grep-discoverable. The OPTIONS array below maps each row to one of these
  // pre-resolved labels.
  const labels = {
    en: t("language.english"),
    hi: t("language.hindi"),
    mr: t("language.marathi"),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px]">
        <DialogHeader>
          <DialogTitle>{t("language.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col">
          {OPTIONS.map((opt) => {
            const isSelected = active === opt.lng;
            return (
              <button
                key={opt.lng}
                type="button"
                disabled={pending}
                onClick={() => handleSelect(opt.lng)}
                aria-pressed={isSelected}
                className={[
                  "flex items-center gap-3 px-4 py-4 text-left border-b border-neutral-100 last:border-b-0 min-h-[56px]",
                  isSelected ? "bg-[#f5f7ff]" : "bg-white",
                ].join(" ")}
              >
                {isSelected ? (
                  <Check size={16} className="text-[#0E5A48]" />
                ) : (
                  <span className="inline-block w-4 h-4" aria-hidden="true" />
                )}
                {/* UI-SPEC §Typography lines 249-253 — Devanagari font is the
                    FIRST choice on the row label span so हिन्दी / मराठी always
                    render in the bundled font, never the device default. */}
                <span
                  className="text-base text-neutral-900"
                  style={{ fontFamily: ROW_LABEL_FONT_FAMILY }}
                >
                  {labels[opt.lng]}
                </span>
              </button>
            );
          })}
          {errorKey ? (
            <div role="alert" className="text-sm text-red-500 mt-4 text-center">
              {t(errorKey)}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
