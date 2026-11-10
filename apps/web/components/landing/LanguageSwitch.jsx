"use client";

// English / हिन्दी / मराठी on the public pages. Writes the parisar_lang cookie through
// setLanguageAction, switches the live i18n instance and refreshes server components,
// the same path as the in-app LanguageSelector. Names are autonyms, so not translated.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { setLanguageAction } from "@/app/actions/set-language";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  { lng: "en", label: "English" },
  { lng: "hi", label: "हिन्दी" },
  { lng: "mr", label: "मराठी" },
];

export function LanguageSwitch({ className }) {
  const { t, i18n } = useTranslation("connect");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const active = String(i18n?.language ?? "en").slice(0, 2);

  function choose(lng) {
    if (lng === active || pending) return;
    setFailed(false);
    startTransition(async () => {
      try {
        await setLanguageAction(lng);
        await i18n.changeLanguage(lng);
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <fieldset aria-busy={pending || undefined} className="flex flex-wrap gap-1">
        <legend className="sr-only">{t("language.label")}</legend>
        {LANGUAGES.map(({ lng, label }) => {
          const on = lng === active;
          return (
            <button
              key={lng}
              type="button"
              lang={lng}
              aria-pressed={on}
              disabled={pending}
              onClick={() => choose(lng)}
              className={cn(
                "focus-ring min-h-11 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-60",
                on
                  ? "bg-primary-soft text-primary-soft-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </fieldset>
      {failed ? (
        <p role="alert" className="type-body-sm text-destructive">
          {t("language.saveError")}
        </p>
      ) : null}
    </div>
  );
}
