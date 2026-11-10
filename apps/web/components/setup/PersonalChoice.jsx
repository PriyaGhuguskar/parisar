"use client";

// After the society is set up, an authority either joins as a resident (picks
// their own flat on /onboarding, the existing resident flow) or says they only
// manage the society (authority_skip_personal_onboarding). Both are real; the
// skip is recorded only once the server confirms it.

import { authoritySkipPersonalOnboarding } from "@parisar/api-client";
import { Building2, Home } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Notice, SurfaceCard } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { callRpc } from "./lib/rpc";
import { errorText } from "./lib/setupModel";

export function PersonalChoice({ societyId }) {
  const { t } = useTranslation("setup-wizard");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function skip() {
    setBusy(true);
    setError(null);
    const res = await callRpc((sb) => authoritySkipPersonalOnboarding(sb, societyId));
    if (res.error) {
      setBusy(false);
      setError(errorText(t, res.error));
      return;
    }
    router.push("/society-dashboard");
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="personal-choice-title">
      <div>
        <h2 id="personal-choice-title" className="type-h2 text-foreground">
          {t("personal.title")}
        </h2>
        <p className="type-body mt-1 text-muted-foreground">{t("personal.lead")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SurfaceCard className="flex flex-col gap-3 p-5">
          <Home aria-hidden="true" className="size-5 text-primary" />
          <h3 className="type-h3 text-foreground">{t("personal.liveTitle")}</h3>
          <p className="type-body-sm flex-1 text-muted-foreground">{t("personal.liveBody")}</p>
          <Link href="/onboarding" className={buttonVariants({ size: "touch" })}>
            {t("personal.liveAction")}
          </Link>
        </SurfaceCard>
        <SurfaceCard className="flex flex-col gap-3 p-5">
          <Building2 aria-hidden="true" className="size-5 text-primary" />
          <h3 className="type-h3 text-foreground">{t("personal.manageTitle")}</h3>
          <p className="type-body-sm flex-1 text-muted-foreground">{t("personal.manageBody")}</p>
          <Button type="button" variant="outline" size="touch" disabled={busy} onClick={skip}>
            {busy ? t("saving") : t("personal.manageAction")}
          </Button>
        </SurfaceCard>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </section>
  );
}
