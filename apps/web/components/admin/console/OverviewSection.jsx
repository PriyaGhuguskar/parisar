"use client";

// Console overview: the five onboarding numbers, billing for admins only, and the
// next open requests to ring. Billing figures come from admin_stats, which returns
// NULL for mrr and past_due to sales, so sales never see a misleading zero.

import { IndianRupee, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ErrorState, LoadingState, MetricCard, StatusBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  currentSlot,
  displayPhone,
  formatSlotDate,
  formatSlotTime,
} from "../onboarding/lib/requestFormat";
import { OnboardingMetrics } from "../onboarding/OnboardingMetrics";

function NextCalls({ nextCalls, onRetry, onOpenRequest, onOpenRequests, t, lng }) {
  if (nextCalls.loading && nextCalls.items.length === 0) {
    return <LoadingState variant="list" rows={3} />;
  }
  if (nextCalls.error) {
    return <ErrorState description={t("overview.nextCallsError")} onRetry={onRetry} />;
  }
  if (nextCalls.items.length === 0) {
    return <p className="type-body text-muted-foreground">{t("overview.nextCallsEmpty")}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {nextCalls.items.map((request) => {
          const slot = currentSlot(request);
          const when = request.call_now
            ? t("common.callNow")
            : [formatSlotDate(slot, lng), formatSlotTime(slot, lng)].filter(Boolean).join(", ");
          return (
            <li key={request.id}>
              <button
                type="button"
                onClick={() => onOpenRequest(request)}
                className="focus-ring flex min-h-11 w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 text-left shadow-card transition-shadow hover:shadow-raised"
              >
                <span className="min-w-0">
                  <span className="type-body block truncate font-medium text-foreground">
                    {request.society_name}
                  </span>
                  <span className="type-body-sm block text-muted-foreground">
                    {request.contact_name} · {displayPhone(request.phone)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="type-body-sm text-muted-foreground">{when}</span>
                  <StatusBadge status={request.status} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="touch"
        className="self-start"
        onClick={onOpenRequests}
      >
        {t("overview.viewAll")}
      </Button>
    </div>
  );
}

export function OverviewSection({
  isAdmin,
  stats,
  metrics,
  onRetryMetrics,
  nextCalls,
  onRetryNextCalls,
  onOpenRequest,
  onOpenRequests,
}) {
  const { t, i18n } = useTranslation("platform");
  const showBilling = isAdmin && stats?.mrr != null;
  return (
    <div className="flex flex-col gap-8">
      <h1 className="type-h1 text-foreground">{t("overview.title")}</h1>

      <section className="flex flex-col gap-4">
        <h2 className="type-h2 text-foreground">{t("overview.onboardingHeading")}</h2>
        <OnboardingMetrics
          metrics={metrics.data}
          loading={metrics.loading}
          error={metrics.error}
          onRetry={onRetryMetrics}
          onOpenRequests={onOpenRequests}
        />
      </section>

      {showBilling ? (
        <section className="flex flex-col gap-4">
          <h2 className="type-h2 text-foreground">{t("overview.billingHeading")}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
            <MetricCard
              label={t("overview.mrr")}
              value={`₹${Number(stats.mrr ?? 0).toLocaleString("en-IN")}`}
              icon={IndianRupee}
              tone="brand"
            />
            <MetricCard
              label={t("overview.pastDue")}
              value={Number(stats.past_due ?? 0).toLocaleString("en-IN")}
              icon={TriangleAlert}
              tone="danger"
            />
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="type-h2 text-foreground">{t("overview.nextCalls")}</h2>
        <NextCalls
          nextCalls={nextCalls}
          onRetry={onRetryNextCalls}
          onOpenRequest={onOpenRequest}
          onOpenRequests={onOpenRequests}
          t={t}
          lng={i18n.language}
        />
      </section>
    </div>
  );
}
