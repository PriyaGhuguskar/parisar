// Shared layout for /setup/*: a slim brand header over the page ground. The
// wizard sets its own width (PageShell), so nothing here constrains it.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { getServerT } from "../../../lib/i18n/server";

export default async function SetupLayout({ children }) {
  const { t } = await getServerT(["auth"]);
  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center border-b border-border bg-card px-4">
        <span className="type-body font-semibold text-primary">{t("common.appName")}</span>
      </header>
      <div>{children}</div>
    </div>
  );
}
