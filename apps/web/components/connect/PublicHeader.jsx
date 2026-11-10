"use client";

// Top bar for /connect and /connect/success: wordmark and a way back home.
// The language switch was removed at the product owner's request (2026-11-10);
// it will be added back later. LanguageSwitch still lives in components/landing.

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Wordmark } from "@/components/landing/Wordmark";
import { buttonVariants } from "@/components/ui/button";

export function PublicHeader() {
  const { t } = useTranslation("connect");
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
        <Wordmark label={t("brand.home")} />
        <Link href="/" className={buttonVariants({ variant: "ghost", size: "touch" })}>
          <ArrowLeft aria-hidden="true" />
          {t("nav.backHome")}
        </Link>
      </div>
    </header>
  );
}
