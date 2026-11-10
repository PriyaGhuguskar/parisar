"use client";

// Society Dashboard numbers from society_admin_dashboard (real rows only; the
// metrics with no module behind them are not returned and not shown), plus a
// "finish setup" prompt while setup_completed_at is still empty.

import { getSocietyRegistration, societyAdminDashboard } from "@parisar/api-client";
import {
  BadgeCheck,
  Building2,
  DoorOpen,
  Home,
  Inbox,
  MessageSquareWarning,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState, LoadingState, MetricCard, Notice } from "@/components/kit";
import { callRpc } from "@/components/setup/lib/rpc";
import { buttonVariants } from "@/components/ui/button";

export function SocietyMetrics({ societyId }) {
  const { t } = useTranslation("setup-wizard");
  const [data, setData] = useState(null);
  const [setupDone, setSetupDone] = useState(true);
  const [phase, setPhase] = useState("loading");

  const load = useCallback(async () => {
    setPhase("loading");
    const [dash, reg] = await Promise.all([
      callRpc((sb) => societyAdminDashboard(sb, societyId)),
      callRpc((sb) => getSocietyRegistration(sb, societyId)),
    ]);
    if (!reg.error) setSetupDone(Boolean(reg.data?.setup_completed_at));
    if (dash.error) {
      // An authority whose role no longer carries manager powers can open the
      // dashboard but not these numbers: say so instead of offering a retry.
      setPhase(dash.error === "NOT_SOCIETY_MANAGER" ? "denied" : "error");
      return;
    }
    setData(dash.data);
    setPhase("ready");
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  const pending = data?.pending_requests ?? {};
  const pendingTotal =
    (pending.memberships ?? 0) + (pending.household ?? 0) + (pending.tenants ?? 0);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="society-metrics-title">
      <h2 id="society-metrics-title" className="type-h2 text-foreground">
        {t("metrics.title")}
      </h2>
      {!setupDone ? (
        <Notice
          tone="warning"
          title={t("metrics.setupTitle")}
          action={
            <Link href="/setup" className={buttonVariants({ size: "touch" })}>
              {t("metrics.setupAction")}
            </Link>
          }
        >
          {t("metrics.setupBody")}
        </Notice>
      ) : null}
      {phase === "loading" ? <LoadingState variant="cards" rows={8} label={t("loading")} /> : null}
      {phase === "error" ? (
        <ErrorState description={t("metrics.loadError")} onRetry={load} />
      ) : null}
      {phase === "denied" ? <Notice tone="info">{t("metrics.managerOnly")}</Notice> : null}
      {phase === "ready" ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <MetricCard label={t("metrics.flats")} value={data.flats} icon={Building2} tone="brand" />
          <MetricCard
            label={t("metrics.occupied")}
            value={data.occupied}
            icon={Home}
            tone="success"
          />
          <MetricCard
            label={t("metrics.vacant")}
            value={data.vacant}
            icon={DoorOpen}
            tone="neutral"
          />
          <MetricCard
            label={t("metrics.notReady")}
            value={(data.under_construction ?? 0) + (data.maintenance ?? 0)}
            hint={t("metrics.notReadyHint", {
              construction: data.under_construction ?? 0,
              maintenance: data.maintenance ?? 0,
            })}
            icon={Wrench}
            tone="warning"
          />
          <MetricCard
            label={t("metrics.residents")}
            value={data.residents}
            icon={Users}
            tone="brand"
          />
          <MetricCard
            label={t("metrics.pendingRequests")}
            value={pendingTotal}
            hint={t("metrics.pendingHint", {
              memberships: pending.memberships ?? 0,
              household: pending.household ?? 0,
              tenants: pending.tenants ?? 0,
            })}
            icon={Inbox}
            tone="warning"
            href="/dashboard/review-queue"
          />
          <MetricCard
            label={t("metrics.pendingVerification")}
            value={data.pending_verification}
            icon={BadgeCheck}
            tone="info"
          />
          <MetricCard
            label={t("metrics.openComplaints")}
            value={data.open_complaints}
            hint={t("metrics.visitorsToday", { count: data.todays_visitors ?? 0 })}
            icon={MessageSquareWarning}
            tone="danger"
            href="/complaints"
          />
        </div>
      ) : null}
    </section>
  );
}
