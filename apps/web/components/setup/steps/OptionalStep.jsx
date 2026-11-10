"use client";

// Step 5: optional configuration, then Complete setup.
//
// Amenities are managed inline (the existing AmenitiesSection, real RPCs). The
// other optional areas each have a real screen already, so they are listed with
// a link and marked "Complete later"; nothing here pretends to configure them.
// Modules with no backend (parking, accounting, vendors, events) are not shown.
//
// Complete setup: amenities is marked completed if the society has any, else
// skipped; every other unfinished optional step is skipped (= complete later);
// then setup_complete, which itself insists on a real wing, floor and flat.

import { setupComplete, setupCompleteStep, setupSkipStep } from "@parisar/api-client";
import { ChevronRight, ClipboardList, ShieldCheck, Upload, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormActions, Notice, StatusBadge, SurfaceCard } from "@/components/kit";
import { AmenitiesSection } from "@/components/society/AmenitiesSection";
import { callRpc } from "../lib/rpc";
import { isDone, stepStatuses } from "../lib/setupModel";

export const LATER_ITEMS = [
  { key: "authorities", href: "/society-dashboard", icon: ShieldCheck },
  { key: "staff", href: "/staff/manage", icon: Users },
  { key: "guards", href: "/society", icon: ClipboardList },
  { key: "residents_import", href: "/import", icon: Upload },
];

async function amenityCount(societyId) {
  const res = await callRpc(async (sb) => {
    const { count, error } = await sb
      .from("amenities")
      .select("id", { count: "exact", head: true })
      .eq("society_id", societyId);
    if (error) throw error;
    return { count: count ?? 0 };
  });
  return res.data?.count ?? 0;
}

function statusBadge(status, t) {
  if (status === "completed") return <StatusBadge status="completed" label={t("optional.done")} />;
  return <StatusBadge status="draft" tone="neutral" label={t("optional.later")} />;
}

export function OptionalStep({ societyId, state, reload, errorText, onBack, onCompleted }) {
  const { t } = useTranslation("setup-wizard");
  const statuses = stepStatuses(state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function finish(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    if (!isDone(statuses.amenities)) {
      const count = await amenityCount(societyId);
      const step = "amenities";
      const res = await callRpc((sb) =>
        count > 0
          ? setupCompleteStep(sb, { societyId, step })
          : setupSkipStep(sb, { societyId, step }),
      );
      if (res.error) {
        setBusy(false);
        setError(errorText(res.error));
        return;
      }
    }
    for (const { key } of LATER_ITEMS) {
      if (isDone(statuses[key])) continue;
      const res = await callRpc((sb) => setupSkipStep(sb, { societyId, step: key }));
      if (res.error) {
        setBusy(false);
        setError(errorText(res.error));
        return;
      }
    }
    const done = await callRpc((sb) => setupComplete(sb, societyId));
    setBusy(false);
    if (done.error) {
      await reload();
      setError(errorText(done.error));
      return;
    }
    onCompleted(done.data);
  }

  return (
    // AmenitiesSection opens its own dialog form; React bubbles submit through
    // portals, so only the action row sits inside this form.
    <div className="flex flex-col gap-8">
      <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <h2 className="type-h3 text-foreground">{t("optional.amenitiesTitle")}</h2>
          <p className="type-body-sm mt-1 text-muted-foreground">{t("optional.amenitiesLead")}</p>
        </div>
        <AmenitiesSection societyId={societyId} embedded />
      </SurfaceCard>

      <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <h2 className="type-h3 text-foreground">{t("optional.laterTitle")}</h2>
          <p className="type-body-sm mt-1 text-muted-foreground">{t("optional.laterLead")}</p>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {LATER_ITEMS.map(({ key, href, icon: Icon }) => (
            <li key={key} className="py-1 first:pt-0 last:pb-0">
              <Link
                href={href}
                className="focus-ring flex min-h-14 items-center gap-3 rounded-lg px-1 py-2 hover:bg-muted"
              >
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground"
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="type-body block font-semibold text-foreground">
                    {t(`optional.items.${key}.title`)}
                  </span>
                  <span className="type-body-sm block text-muted-foreground">
                    {t(`optional.items.${key}.body`)}
                  </span>
                </span>
                {statusBadge(statuses[key], t)}
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      </SurfaceCard>

      <form onSubmit={finish} className="flex flex-col gap-4" noValidate>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <FormActions
          submitLabel={t("completeSetup")}
          submittingLabel={t("completing")}
          submitting={busy}
          onBack={onBack}
          backLabel={t("previous")}
          sticky
        />
      </form>
    </div>
  );
}
