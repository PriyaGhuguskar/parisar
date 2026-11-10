"use client";

// Feature toggles for Register Society, straight from admin_feature_catalogue.
// Core features are always on; add-ons are switches; keys with no module are
// listed as not available and cannot be chosen (the RPC refuses them anyway).

import { useTranslation } from "react-i18next";
import { LoadingState, Notice, SurfaceCard } from "@/components/kit";
import { Switch } from "@/components/ui/switch";

function FeatureRow({ feature, checked, onToggle, t }) {
  const labelId = `reg-feature-${feature.key}`;
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p id={labelId} className="type-body font-medium text-foreground">
          {feature.name}
        </p>
        {feature.description ? (
          <p className="type-body-sm mt-0.5 text-muted-foreground">{feature.description}</p>
        ) : null}
      </div>
      {feature.is_core ? (
        <span className="type-body-sm shrink-0 font-medium text-muted-foreground">
          {t("register.included")}
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-3">
          <span className="type-body-sm tabular-nums text-muted-foreground">
            {t("register.pricePerMonth", { price: feature.price_monthly ?? 0 })}
          </span>
          <span className="flex size-11 items-center justify-center">
            <Switch
              checked={checked}
              onCheckedChange={(next) => onToggle(feature.key, next)}
              aria-labelledby={labelId}
            />
          </span>
        </span>
      )}
    </li>
  );
}

export function RegisterFeatures({ catalogue, selected, onToggle }) {
  const { t } = useTranslation("platform");
  const features = catalogue.data?.features ?? [];
  const unavailable = catalogue.data?.unavailable ?? [];
  return (
    <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 className="type-h3 text-foreground">{t("register.featuresSection")}</h2>
        <p className="type-body-sm mt-1 text-muted-foreground">{t("register.featuresHint")}</p>
      </div>
      {catalogue.loading ? (
        <LoadingState variant="inline" label={t("register.featuresLoading")} />
      ) : null}
      {catalogue.error ? <Notice tone="warning">{t("register.featuresError")}</Notice> : null}
      {features.length > 0 ? (
        <ul className="divide-y divide-border">
          {features.map((feature) => (
            <FeatureRow
              key={feature.key}
              feature={feature}
              checked={selected.has(feature.key)}
              onToggle={onToggle}
              t={t}
            />
          ))}
        </ul>
      ) : null}
      {unavailable.length > 0 ? (
        <div>
          <h3 className="type-body-sm font-medium text-muted-foreground">
            {t("register.notAvailableHeading")}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {unavailable.map((gap) => (
              <li
                key={gap.key}
                className="type-body-sm rounded-full border border-border bg-muted px-3 py-1 text-muted-foreground"
              >
                {gap.name}
                <span className="sr-only">: {t("register.notAvailable")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SurfaceCard>
  );
}
