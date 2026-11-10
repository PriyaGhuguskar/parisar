"use client";

import { useTranslation } from "react-i18next";

export function ConnectIntro() {
  const { t } = useTranslation("connect");
  return (
    <div className="flex flex-col gap-2">
      <h1 className="type-display text-foreground">{t("page.title")}</h1>
      <p className="type-body-lg text-muted-foreground">{t("page.lead")}</p>
    </div>
  );
}
