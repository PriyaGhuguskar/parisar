"use client";

// The five onboarding numbers from admin_onboarding_metrics. The parent loads them
// (the sidebar badge needs the same call) and passes the state down.

import { Building2, CheckCircle2, Inbox, PhoneCall, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ErrorState, MetricCard } from "@/components/kit";

const CARDS = [
  { key: "total_societies", label: "metrics.totalSocieties", icon: Building2, tone: "brand" },
  {
    key: "active_societies",
    label: "metrics.activeSocieties",
    icon: CheckCircle2,
    tone: "success",
  },
  { key: "pending_requests", label: "metrics.pendingRequests", icon: Inbox, tone: "info" },
  {
    key: "pending_calls",
    label: "metrics.pendingCalls",
    icon: PhoneCall,
    tone: "warning",
    hint: "metrics.pendingCallsHint",
  },
  { key: "total_residents", label: "metrics.totalResidents", icon: Users, tone: "neutral" },
];

export function OnboardingMetrics({ metrics, loading, error, onRetry, onOpenRequests }) {
  const { t } = useTranslation("platform");
  if (error) return <ErrorState description={t("metrics.loadError")} onRetry={onRetry} />;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
      {CARDS.map((card) => {
        const value = metrics?.[card.key];
        const number = typeof value === "number" ? value.toLocaleString("en-IN") : null;
        const clickable = onOpenRequests && card.key.startsWith("pending_");
        const body = (
          <MetricCard
            label={t(card.label)}
            value={number}
            hint={card.hint ? t(card.hint) : undefined}
            icon={card.icon}
            tone={card.tone}
            loading={loading}
            className="h-full"
          />
        );
        if (!clickable) return <div key={card.key}>{body}</div>;
        return (
          <button
            key={card.key}
            type="button"
            onClick={onOpenRequests}
            className="focus-ring rounded-xl text-left transition-shadow hover:shadow-raised"
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}
