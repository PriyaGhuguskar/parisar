// Shared layout for /setup/* — now only /setup/structure renders here (the old
// 6-step wizard routes redirect to it), so the step-progress bar and its
// hard-coded English step labels, plus the audit_log "society.created" resume
// probe that fed the retired wizard store, are gone.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { getServerT } from "../../../lib/i18n/server";

export default async function SetupLayout({ children }) {
  const { t } = await getServerT(["auth"]);
  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <header className="bg-[var(--color-neutral-0)] border-b border-[var(--color-neutral-200)] px-4 h-14 flex items-center">
        <span className="text-base font-semibold text-[var(--color-brand-500)]">
          {t("common.appName")}
        </span>
      </header>

      {/* Step content — max-width 560px, centred */}
      <main className="flex justify-center px-4 py-8">
        <div className="w-full max-w-[560px]">{children}</div>
      </main>
    </div>
  );
}
