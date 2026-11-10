"use client";

// What Register Society shows once the server has confirmed it: the society name,
// the generated join code with a copy button, and the registration status as the
// database reports it. Nothing is sent to anyone, and the screen says so.

import { useTranslation } from "react-i18next";
import { CopyButton, Notice, StatusBadge, SurfaceCard } from "@/components/kit";
import { Button } from "@/components/ui/button";

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:gap-4">
      <dt className="type-body-sm shrink-0 text-muted-foreground sm:w-44">{label}</dt>
      <dd className="type-body min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

export function RegisterResult({ result, onOpenSociety, onRegisterAnother, onBackToRequests }) {
  const { t } = useTranslation("platform");
  const registration = result.registration;
  const service = registration?.service_status;
  return (
    <SurfaceCard className="flex flex-col gap-6 p-5 sm:p-6">
      <Notice tone="success" title={t("register.resultTitle", { name: result.name })}>
        {t("register.resultBody")}
      </Notice>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-primary-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="type-body-sm text-primary-soft-foreground">{t("register.code")}</p>
          <p
            data-testid="society-code"
            className="type-metric break-all tracking-[0.12em] text-foreground tabular-nums"
          >
            {result.code}
          </p>
        </div>
        <CopyButton value={result.code} label={t("register.copyCode")} />
      </div>

      <dl className="divide-y divide-border">
        <Row label={t("register.status")}>
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status="registered" label={t("register.statusRegistered")} />
            {result.requestCode ? (
              <span className="type-body-sm text-muted-foreground">
                {t("register.requestClosed", { code: result.requestCode })}
              </span>
            ) : null}
          </span>
        </Row>
        {service ? (
          <Row label={t("register.service")}>
            {t(`service.${service}`, { defaultValue: service })}
          </Row>
        ) : null}
        {registration ? (
          <Row label={t("register.setup")}>
            {registration.setup_completed_at ? t("register.setupDone") : t("register.setupPending")}
          </Row>
        ) : null}
        <Row label={t("register.authorityTotal")}>
          <span className="tabular-nums">{result.authority_count ?? 0}</span>
        </Row>
        <Row label={t("register.featureTotal")}>
          <span className="tabular-nums">{result.features?.length ?? 0}</span>
        </Row>
      </dl>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" size="touch" onClick={() => onOpenSociety(result.society_id)}>
          {t("register.openSociety")}
        </Button>
        {onBackToRequests ? (
          <Button type="button" variant="outline" size="touch" onClick={onBackToRequests}>
            {t("register.backToRequests")}
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="touch" onClick={onRegisterAnother}>
          {t("register.registerAnother")}
        </Button>
      </div>
    </SurfaceCard>
  );
}
