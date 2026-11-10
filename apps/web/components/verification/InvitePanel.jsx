"use client";

// A copyable invitation for an imported resident. Nothing is sent: there is no SMS
// or email provider, and the screen says so in plain words.

import { useTranslation } from "react-i18next";
import { CopyButton, Notice, SurfaceCard } from "@/components/kit";
import { Button } from "@/components/ui/button";

export function residentInviteMessage(t, invite, origin) {
  return t("invite.residentMessage", {
    name: invite.full_name,
    flat: invite.flat_label ?? "",
    url: `${origin}/login`,
  });
}

export function InvitePanel({ invite, onClose }) {
  const { t } = useTranslation("resident-onboarding");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const message = residentInviteMessage(t, invite, origin);
  return (
    <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
      <h2 className="type-h3 text-foreground">{t("invite.title", { name: invite.full_name })}</h2>
      <Notice tone="warning" title={t("invite.notSentTitle")}>
        {t("invite.notSentBody", { phone: invite.phone })}
      </Notice>
      <p className="type-body rounded-lg bg-muted p-3 text-foreground break-words whitespace-pre-wrap">
        {message}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <CopyButton value={message} label={t("invite.copyMessage")} />
        <Button type="button" variant="ghost" size="touch" onClick={onClose}>
          {t("common.close")}
        </Button>
      </div>
    </SurfaceCard>
  );
}
