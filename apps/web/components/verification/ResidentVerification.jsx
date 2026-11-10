"use client";

// /verification: after OTP, a person sees the details their society added for this
// exact verified phone (my_resident_records returns nothing for anyone else) and
// confirms, proposes edits, or reports them as wrong. Confirming creates their one
// membership; then a PIN if they have none, then the app.

import { myResidentRecords } from "@parisar/api-client";
import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { setMyPin } from "@/app/actions/codeLogin";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  PageHeader,
  PageShell,
} from "@/components/kit";
import { PinSetup, pinErrorMessage } from "@/components/onboarding/PinSetup";
import { Button, buttonVariants } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { RecordCard } from "./RecordCard";

export function ResidentVerification({ pinSet }) {
  const { t } = useTranslation("resident-onboarding");
  const router = useRouter();
  const [records, setRecords] = useState(null);
  const [failed, setFailed] = useState(false);
  const [confirmed, setConfirmed] = useState(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await myResidentRecords(createSupabaseBrowserClient());
      if (res?.error) throw new Error(res.error);
      setRecords(Array.isArray(res) ? res : []);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function replace(updated) {
    setRecords((rs) => rs.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
  }

  async function savePin(pin) {
    const res = await setMyPin(pin);
    if (res?.error) return pinErrorMessage(t, res.error);
    router.push("/dashboard");
    return null;
  }

  let body;
  if (failed) body = <ErrorState description={t("verify.loadError")} onRetry={load} />;
  else if (!records) body = <LoadingState variant="cards" rows={1} />;
  else if (confirmed) {
    body = (
      <div className="flex flex-col gap-6">
        <Notice tone="success" title={t("verify.confirmedTitle")}>
          {t("verify.confirmedBody", {
            flat: confirmed.flat_label,
            society: confirmed.society_name,
          })}
        </Notice>
        {pinSet ? (
          <Button
            type="button"
            size="touch"
            className="self-start"
            onClick={() => router.push("/dashboard")}
          >
            {t("common.openApp")}
          </Button>
        ) : (
          <PinSetup onSubmit={savePin} submitLabel={t("pin.saveAndOpen")} />
        )}
      </div>
    );
  } else if (records.length === 0) {
    body = (
      <EmptyState
        icon={ClipboardCheck}
        title={t("verify.emptyTitle")}
        description={t("verify.emptyBody")}
        action={
          <Link href="/onboarding?manual=1" className={buttonVariants({ size: "touch" })}>
            {t("statusPage.joinWithCode")}
          </Link>
        }
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        {records.map((r) => (
          <RecordCard
            key={r.id}
            record={r}
            onConfirmed={(rec) => setConfirmed(rec)}
            onUpdated={replace}
          />
        ))}
        <p className="type-body-sm text-muted-foreground">
          {t("verify.notYou")}{" "}
          <Link href="/onboarding?manual=1" className="focus-ring rounded text-primary underline">
            {t("statusPage.joinWithCode")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageShell width="narrow">
        <PageHeader title={t("verify.title")} description={t("verify.sub")} />
        {body}
      </PageShell>
    </div>
  );
}
