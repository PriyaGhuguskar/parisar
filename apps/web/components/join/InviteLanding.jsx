"use client";

// Public face of a family invite link. It reveals nothing about the invite: the
// details are shown only after the person signs in with OTP, because the preview
// RPC needs a session and, for phone-bound invites, that exact phone.

import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Notice, PageShell, SurfaceCard } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";

export const INVITE_TOKEN_RE = /^[0-9a-f]{64}$/;

export function InviteLanding({ token }) {
  const { t } = useTranslation("resident-onboarding");
  const valid = INVITE_TOKEN_RE.test(token ?? "");
  const next = `/join/invite/${token}`;
  return (
    <main className="min-h-screen bg-background">
      <PageShell width="narrow">
        <div className="mb-8 flex items-center gap-3">
          <Image src="/parisar-mark-96.png" alt="" aria-hidden="true" width={40} height={40} />
          <span className="type-body font-semibold text-foreground">Parisar</span>
        </div>
        <h1 className="type-display text-foreground">{t("acceptPage.publicTitle")}</h1>
        <p className="type-body-lg mt-2 text-muted-foreground">{t("acceptPage.publicSub")}</p>
        <SurfaceCard className="mt-8 flex flex-col gap-4 p-5 sm:p-6">
          {valid ? (
            <>
              <ol className="type-body list-decimal ps-5 text-foreground">
                <li>{t("acceptPage.stepSignIn")}</li>
                <li>{t("acceptPage.stepCheck")}</li>
                <li>{t("acceptPage.stepProfile")}</li>
              </ol>
              <Link
                href={`/login?next=${encodeURIComponent(next)}`}
                className={buttonVariants({ size: "touch", className: "self-start" })}
              >
                {t("acceptPage.signIn")}
              </Link>
              <p className="type-body-sm text-muted-foreground">{t("acceptPage.publicNote")}</p>
            </>
          ) : (
            <Notice tone="danger" title={t("acceptPage.badLinkTitle")}>
              {t("acceptPage.badLinkBody")}
            </Notice>
          )}
        </SurfaceCard>
      </PageShell>
    </main>
  );
}
