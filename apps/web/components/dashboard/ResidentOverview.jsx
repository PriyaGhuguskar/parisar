"use client";

// A resident's home at a glance, from resident_dashboard: their flat, what is
// waiting for them, and emergency. Only real modules appear, and only those the
// society has switched on. Approvals the resident can act on show as notices.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { residentDashboard } from "@parisar/api-client";
import { Bell, CalendarCheck, DoorOpen, MessageSquareWarning, Vote } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState, MetricCard, Notice, SurfaceCard } from "@/components/kit";
import { SosButton } from "@/components/sos/SosButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useReloadable } from "./useReloadable";

/** The cards for a resident_dashboard result. Exported for tests. */
export function residentMetricCards(data, isEnabled) {
  const d = data ?? {};
  const cards = [
    {
      id: "visitorsWaiting",
      value: d.pending_visitors,
      icon: DoorOpen,
      tone: d.pending_visitors > 0 ? "warning" : "neutral",
      href: "/visitors",
      feature: "visitors",
    },
    {
      id: "myComplaints",
      value: d.my_open_complaints,
      icon: MessageSquareWarning,
      tone: "neutral",
      href: "/my-complaints",
      feature: "complaints",
    },
    {
      id: "upcomingBookings",
      value: d.upcoming_bookings,
      icon: CalendarCheck,
      tone: "info",
      href: "/bookings",
      feature: "bookings",
    },
    {
      id: "noticesWeek",
      value: d.notices_last_7_days,
      icon: Bell,
      tone: "brand",
      href: "/notices",
      feature: "notices",
    },
    {
      id: "openPolls",
      value: d.open_polls,
      icon: Vote,
      tone: "info",
      href: "/polls",
      feature: "polls",
    },
  ];
  return cards.filter((c) => isEnabled(c.feature));
}

function FlatCard({ data, t }) {
  const type = data.resident_type ? t(`residentType.${data.resident_type}`) : null;
  const title =
    data.society_title && data.society_title !== "resident"
      ? t(`societyTitle.${data.society_title}`)
      : null;
  return (
    <SurfaceCard className="flex flex-col gap-1 p-4 sm:p-5">
      <p className="type-body-sm font-medium text-muted-foreground">{t("residentDash.myFlat")}</p>
      {data.flat_id ? (
        <>
          <p className="type-metric text-foreground">{data.flat_label}</p>
          <p className="type-body-sm text-muted-foreground">
            {[type, title, t("residentDash.household", { count: data.household_members ?? 0 })]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </>
      ) : (
        <p className="type-body text-foreground">{t("residentDash.noFlat")}</p>
      )}
    </SurfaceCard>
  );
}

/**
 * @param {{ societyId: string, initial?: { data?: object, error?: boolean },
 *   isEnabled: (key: string) => boolean }} props
 */
export function ResidentOverview({ societyId, initial, isEnabled }) {
  const { t } = useTranslation("staff-nav");
  const load = useCallback(
    () => residentDashboard(createSupabaseBrowserClient(), societyId),
    [societyId],
  );
  const { status, data, reload } = useReloadable(initial, load);
  const loading = status === "loading";

  if (status === "error") {
    return (
      <section className="mb-8" aria-label={t("residentDash.title")}>
        <ErrorState description={t("residentDash.loadFailed")} onRetry={reload} />
      </section>
    );
  }

  const cards = residentMetricCards(data, isEnabled);
  const household = data?.pending_household_requests ?? 0;
  const tenants = data?.pending_tenant_approvals ?? 0;

  return (
    <section
      aria-labelledby="resident-overview-title"
      className="mb-8"
      data-testid="resident-overview"
    >
      <h2 id="resident-overview-title" className="type-h2 mb-4 text-foreground">
        {t("residentDash.title")}
      </h2>

      {household > 0 || tenants > 0 ? (
        <div className="mb-4 flex flex-col gap-3">
          {household > 0 ? (
            <Notice
              tone="info"
              title={t("residentDash.householdWaiting", { count: household })}
              action={
                <Link href="/household" className="focus-ring font-semibold underline">
                  {t("residentDash.review")}
                </Link>
              }
            />
          ) : null}
          {tenants > 0 ? (
            <Notice
              tone="info"
              title={t("residentDash.tenantsWaiting", { count: tenants })}
              action={
                <Link href="/approvals" className="focus-ring font-semibold underline">
                  {t("residentDash.review")}
                </Link>
              }
            />
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-4">
        <div className="flex flex-col gap-3 md:gap-4">
          {loading || !data ? (
            <SurfaceCard className="h-28 animate-pulse p-4" aria-hidden="true" />
          ) : (
            <FlatCard data={data} t={t} />
          )}
          {isEnabled("sos") ? (
            <SurfaceCard className="flex flex-col gap-3 p-4 sm:p-5">
              <div>
                <h3 className="type-h3 text-foreground">{t("residentDash.emergency")}</h3>
                <p className="type-body-sm text-muted-foreground">
                  {t("residentDash.emergencyHint")}
                </p>
              </div>
              <SosButton societyId={societyId} />
            </SurfaceCard>
          ) : null}
        </div>
        <div className="grid grid-cols-2 content-start gap-3 md:gap-4">
          {cards.map((card) => (
            <MetricCard
              key={card.id}
              label={t(`residentDash.metric.${card.id}`)}
              value={card.value ?? null}
              icon={card.icon}
              tone={card.tone}
              href={card.href}
              loading={loading}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
