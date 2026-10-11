"use client";

// PAR-101 — error boundary for every authenticated screen. Contains any render
// throw (including the previously-fixed `t()` crashes) to a friendly recoverable
// card instead of white-screening the whole app. Segment-scoped so the sidebar/
// shell around it stays intact where possible. Dependency-light on purpose.
//
// It renders inside the root layout's I18nProvider, so copy is localized. If
// translation itself is what failed, i18next returns the key — still a working
// "try again" button, never a second crash.

import { useTranslation } from "react-i18next";

export default function ProtectedError({ error, reset }) {
  const { t } = useTranslation("auth");
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div role="alert" className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-[#171717] mb-2">{t("common.errorTitle")}</h1>
        <p className="text-base text-[#525252] mb-5">{t("common.errorBody")}</p>
        <button
          type="button"
          onClick={() => reset()}
          className="h-11 px-6 rounded-xl bg-[#0E5A48] text-white text-base font-semibold hover:bg-[#0A4436] transition-colors"
        >
          {t("common.tryAgain")}
        </button>
        {error?.digest ? (
          <p className="text-xs text-[#6e6e6e] mt-4">
            {t("common.errorRef", { ref: error.digest })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
