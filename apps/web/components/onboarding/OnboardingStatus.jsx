"use client";

// /onboarding/status: what this person is waiting on before they can use the app.
// Tenant registrations (approval chain + documents) and household requests.
// Approval happens on the other side; this page only reports and lets them act
// on their own requests.

import { householdCancelRequest, myOnboardingState } from "@parisar/api-client";
import { Hourglass } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  PageHeader,
  PageShell,
  SurfaceCard,
} from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { errorMessage } from "./lib/errors";
import { StateBadge } from "./StateBadge";
import { TenantRegistrationCard } from "./TenantRegistrationCard";

export function OnboardingStatus({ userId }) {
  const { t } = useTranslation("resident-onboarding");
  const router = useRouter();
  const [state, setState] = useState(null);
  const [failed, setFailed] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [cancelError, setCancelError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await myOnboardingState(createSupabaseBrowserClient());
      if (!res || res.error) throw new Error(res?.error ?? "EMPTY");
      setState(res);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmCancel() {
    const res = await householdCancelRequest(createSupabaseBrowserClient(), cancelling.id);
    if (res?.error) {
      setCancelError(errorMessage(t, res));
      throw new Error(res.error);
    }
    setCancelling(null);
    setNotice(t("statusPage.cancelled"));
    await load();
  }

  async function openApp() {
    await createSupabaseBrowserClient().auth.refreshSession();
    router.push("/dashboard");
  }

  if (failed) {
    return (
      <PageShell width="narrow">
        <ErrorState description={t("statusPage.loadError")} onRetry={load} />
      </PageShell>
    );
  }
  if (!state) {
    return (
      <PageShell width="narrow">
        <LoadingState variant="page" />
      </PageShell>
    );
  }

  const tenants = state.tenant_registrations ?? [];
  const requests = state.household_requests ?? [];
  const openRecords = (state.resident_records ?? []).filter((r) => r.status !== "verified");
  const anyApproved =
    requests.some((r) => r.status === "approved") || tenants.some((r) => r.status === "active");

  return (
    <div className="min-h-screen bg-background">
      <PageShell width="narrow">
        <PageHeader title={t("statusPage.title")} description={t("statusPage.sub")} />
        <div className="flex flex-col gap-6">
          {notice ? (
            <Notice tone="success" onDismiss={() => setNotice(null)}>
              {notice}
            </Notice>
          ) : null}
          {anyApproved ? (
            <Notice
              tone="success"
              title={t("statusPage.approvedTitle")}
              action={
                <Button type="button" size="touch" onClick={openApp}>
                  {t("statusPage.openApp")}
                </Button>
              }
            >
              {t("statusPage.approvedBody")}
            </Notice>
          ) : null}
          {openRecords.length ? (
            <Notice
              tone="info"
              action={
                <Link
                  href="/verification"
                  className={buttonVariants({ variant: "outline", size: "touch" })}
                >
                  {t("statusPage.reviewDetails")}
                </Link>
              }
            >
              {t("statusPage.recordsWaiting")}
            </Notice>
          ) : null}

          {tenants.map((r) => (
            <TenantRegistrationCard key={r.id} registration={r} userId={userId} onChanged={load} />
          ))}

          {requests.map((r) => (
            <SurfaceCard key={r.id} className="flex flex-col gap-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="type-h3 text-foreground">
                    {t("statusPage.householdTitle", {
                      flat: r.flat_label,
                      society: r.society_name ?? "",
                    })}
                  </h2>
                  <p className="type-body-sm mt-1 text-muted-foreground">
                    {t(`relationship.${r.relationship}`)} · {t(`residentType.${r.resident_type}`)}
                  </p>
                </div>
                <StateBadge kind="household" status={r.status} />
              </div>
              <p className="type-body text-foreground">{t(`statusPage.household.${r.status}`)}</p>
              {r.status === "rejected" && r.decision_reason ? (
                <p className="type-body-sm text-muted-foreground">
                  {t("statusPage.reason", { reason: r.decision_reason })}
                </p>
              ) : null}
              {r.status === "pending" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="self-start"
                  onClick={() => {
                    setCancelError(null);
                    setCancelling(r);
                  }}
                >
                  {t("statusPage.cancel")}
                </Button>
              ) : null}
            </SurfaceCard>
          ))}

          {tenants.length === 0 && requests.length === 0 ? (
            <EmptyState
              icon={Hourglass}
              title={t("statusPage.emptyTitle")}
              description={t("statusPage.emptyBody")}
              action={
                <Link href="/onboarding?manual=1" className={buttonVariants({ size: "touch" })}>
                  {t("statusPage.joinWithCode")}
                </Link>
              }
            />
          ) : (
            <Link
              href="/onboarding?manual=1"
              className={buttonVariants({
                variant: "ghost",
                size: "touch",
                className: "self-start",
              })}
            >
              {t("statusPage.joinWithCode")}
            </Link>
          )}
        </div>
      </PageShell>
      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={t("statusPage.cancelTitle")}
        description={t("statusPage.cancelBody")}
        confirmLabel={t("statusPage.cancelConfirm")}
        errorMessage={cancelError ?? undefined}
        onConfirm={confirmCancel}
      />
    </div>
  );
}
