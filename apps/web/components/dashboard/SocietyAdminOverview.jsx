"use client";

// Society overview for authorities (secretary / co-secretary): real counts from
// society_admin_dashboard. Each card links to the screen where the work happens,
// and cards for modules the society has switched off are left out. Metrics with no
// module (dues, parking, vendors, staff attendance) do not exist here by design.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { societyAdminDashboard } from "@parisar/api-client";
import {
  Building2,
  ClipboardCheck,
  DoorClosed,
  DoorOpen,
  Home,
  MessageSquareWarning,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState, MetricCard, Notice } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useReloadable } from "./useReloadable";

/** The cards to show for a society_admin_dashboard result. Exported for tests. */
export function adminMetricCards(data, isEnabled, t) {
  const d = data ?? {};
  const pending = d.pending_requests ?? {};
  const pendingTotal =
    (pending.memberships ?? 0) + (pending.household ?? 0) + (pending.tenants ?? 0);
  const flatsHint = [
    d.under_construction ? t("adminDash.underConstruction", { count: d.under_construction }) : null,
    d.maintenance ? t("adminDash.underMaintenance", { count: d.maintenance }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const cards = [
    {
      id: "residents",
      value: d.residents,
      icon: Users,
      tone: "brand",
      href: "/residents/owners",
    },
    {
      id: "flats",
      value: d.flats,
      icon: Building2,
      tone: "neutral",
      href: "/society",
      hint: flatsHint,
    },
    { id: "occupied", value: d.occupied, icon: Home, tone: "success" },
    { id: "vacant", value: d.vacant, icon: DoorClosed, tone: "neutral" },
    {
      id: "pendingRequests",
      value: d.pending_requests ? pendingTotal : null,
      icon: ClipboardCheck,
      tone: pendingTotal > 0 ? "warning" : "neutral",
      href: "/approvals",
      hint: t("adminDash.pendingBreakdown", {
        memberships: pending.memberships ?? 0,
        household: pending.household ?? 0,
        tenants: pending.tenants ?? 0,
      }),
    },
    {
      id: "pendingVerification",
      value: d.pending_verification,
      icon: UserCheck,
      tone: d.pending_verification > 0 ? "warning" : "neutral",
      href: "/verification/admin",
    },
    {
      id: "openComplaints",
      value: d.open_complaints,
      icon: MessageSquareWarning,
      tone: d.open_complaints > 0 ? "danger" : "neutral",
      href: "/complaints",
      feature: "complaints",
    },
    {
      id: "todaysVisitors",
      value: d.todays_visitors,
      icon: DoorOpen,
      tone: "info",
      href: "/visitors",
      feature: "visitors",
    },
  ];
  return cards.filter((c) => !c.feature || isEnabled(c.feature));
}

/**
 * @param {{ societyId: string, initial?: { data?: object, error?: boolean },
 *   isEnabled: (key: string) => boolean }} props
 */
export function SocietyAdminOverview({ societyId, initial, isEnabled }) {
  const { t } = useTranslation("staff-nav");
  const load = useCallback(
    () => societyAdminDashboard(createSupabaseBrowserClient(), societyId),
    [societyId],
  );
  const { status, data, reload } = useReloadable(initial, load);
  const loading = status === "loading";
  const cards = adminMetricCards(data, isEnabled, t);

  return (
    <section
      aria-labelledby="society-overview-title"
      className="mb-8"
      data-testid="society-overview"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="society-overview-title" className="type-h2 text-foreground">
          {t("adminDash.title")}
        </h2>
        <p className="type-body-sm text-muted-foreground">{t("adminDash.todayNote")}</p>
      </div>

      {status === "error" ? (
        <ErrorState description={t("adminDash.loadFailed")} onRetry={reload} />
      ) : (
        <>
          {!loading && data && !data.flats ? (
            <Notice
              tone="info"
              title={t("adminDash.noFlatsTitle")}
              className="mb-4"
              action={
                <Link href="/setup" className="focus-ring font-semibold text-primary underline">
                  {t("adminDash.noFlatsAction")}
                </Link>
              }
            >
              {t("adminDash.noFlatsBody")}
            </Notice>
          ) : null}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {cards.map((card) => (
              <MetricCard
                key={card.id}
                label={t(`adminDash.metric.${card.id}`)}
                value={card.value ?? null}
                hint={card.hint || undefined}
                icon={card.icon}
                tone={card.tone}
                href={card.href}
                loading={loading}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
