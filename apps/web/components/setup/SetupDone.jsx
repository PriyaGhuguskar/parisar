"use client";

// Shown once setup_complete has succeeded (or the society was already set up).
// Where the authority goes next comes from their setup_state: the result of
// setup_complete, or my_authority_societies when the wizard opened on a society
// that was already complete.

import { myAuthoritySocieties } from "@parisar/api-client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadingState, MetricCard, Notice, PageHeader, PageShell } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { callRpc } from "./lib/rpc";
import { PersonalChoice } from "./PersonalChoice";

export function SetupDone({ societyId, state, completion, onReview }) {
  const { t } = useTranslation("setup-wizard");
  const [setupState, setSetupState] = useState(completion?.setup_state ?? null);
  const [resolving, setResolving] = useState(!completion?.setup_state);

  useEffect(() => {
    if (completion?.setup_state) return;
    let live = true;
    callRpc((sb) => myAuthoritySocieties(sb)).then((res) => {
      if (!live) return;
      const row = (res.data?.societies ?? []).find((s) => s.society_id === societyId);
      setSetupState(row?.setup_state ?? null);
      setResolving(false);
    });
    return () => {
      live = false;
    };
  }, [completion, societyId]);

  const counts = completion?.counts ?? state?.counts ?? {};

  return (
    <PageShell>
      <PageHeader title={t("done.title")} description={state?.society?.name} />
      <div className="flex flex-col gap-8">
        {completion ? (
          <Notice tone="success" title={t("done.savedTitle")}>
            {t("done.saved")}
          </Notice>
        ) : (
          <Notice tone="info">{t("done.already")}</Notice>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          <MetricCard label={t("done.wings")} value={counts.wings ?? null} />
          <MetricCard label={t("done.floors")} value={counts.floors ?? null} />
          <MetricCard label={t("done.flats")} value={counts.flats ?? null} />
        </div>

        {resolving ? (
          <LoadingState variant="inline" label={t("loading")} />
        ) : setupState === "needs_personal_onboarding" ? (
          <PersonalChoice societyId={societyId} />
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/society-dashboard" className={buttonVariants({ size: "touch" })}>
              {t("done.toDashboard")}
            </Link>
            <Link href="/import" className={buttonVariants({ size: "touch", variant: "outline" })}>
              {t("done.toImport")}
            </Link>
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          size="touch"
          className="self-start"
          onClick={onReview}
        >
          {t("done.review")}
        </Button>
      </div>
    </PageShell>
  );
}
