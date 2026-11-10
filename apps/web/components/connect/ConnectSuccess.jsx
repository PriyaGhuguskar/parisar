"use client";

// /connect/success. Right after submitting, shows the request the server confirmed
// (handed over in sessionStorage by ConnectForm). Opened any other way (a reload in a
// new tab, a bookmark, "Check your request"), it offers the status lookup instead, so
// nothing is ever shown that the server did not return.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadingState, Notice, SurfaceCard } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { isValidRequestCode, normalizeRequestCode } from "./lib/connectForm";
import { loadLastRequest } from "./lib/connectStorage";
import { RequestSummary } from "./RequestSummary";
import { StatusLookupForm } from "./StatusLookupForm";

function NextSteps() {
  const { t } = useTranslation("connect");
  return (
    <SurfaceCard className="flex flex-col gap-3 p-5 sm:p-6">
      <h2 className="type-h3 text-foreground">{t("success.nextTitle")}</h2>
      <ol className="flex flex-col gap-2.5">
        {["next1", "next2", "next3"].map((key, index) => (
          <li key={key} className="type-body flex gap-3 text-foreground">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft type-caption font-semibold text-primary-soft-foreground"
            >
              {index + 1}
            </span>
            <span>{t(`success.${key}`)}</span>
          </li>
        ))}
      </ol>
    </SurfaceCard>
  );
}

export function ConnectSuccess({ code = "" }) {
  const { t } = useTranslation("connect");
  const initialCode = isValidRequestCode(code) ? normalizeRequestCode(code) : "";
  // undefined until mounted: storage only exists in the browser.
  const [view, setView] = useState(undefined);

  useEffect(() => {
    // Only with a matching code in the URL: "/connect/success" alone is the lookup,
    // so an older request kept in this tab is never shown as just received.
    const stored = initialCode ? loadLastRequest(initialCode) : null;
    setView(stored ? { mode: "confirmed", request: stored } : { mode: "lookup" });
  }, [initialCode]);

  if (view === undefined) return <LoadingState variant="page" />;

  if (view.mode === "confirmed") {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="type-display text-foreground">{t("success.title")}</h1>
          <p className="type-body-lg text-muted-foreground">{t("success.body")}</p>
        </div>
        <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6">
          <RequestSummary request={view.request} />
          <Notice tone="info">{t("success.keepId")}</Notice>
        </SurfaceCard>
        <NextSteps />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={() => setView({ mode: "lookup", code: view.request.request_code })}
          >
            {t("success.checkLatest")}
          </Button>
          <Link href="/" className={buttonVariants({ variant: "ghost", size: "touch" })}>
            {t("success.home")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="type-display text-foreground">{t("lookup.title")}</h1>
        <p className="type-body-lg text-muted-foreground">{t("lookup.lead")}</p>
      </div>
      <SurfaceCard className="p-5 sm:p-6">
        <StatusLookupForm
          initialCode={view.code ?? initialCode}
          onFound={(request) => setView({ mode: "found", request, code: request.request_code })}
        />
      </SurfaceCard>
      {view.mode === "found" ? (
        <SurfaceCard className="flex flex-col gap-4 p-5 sm:p-6" aria-live="polite">
          <h2 className="type-h3 text-foreground">{t("lookup.resultTitle")}</h2>
          <RequestSummary request={view.request} />
        </SurfaceCard>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/connect" className={buttonVariants({ variant: "outline", size: "touch" })}>
          {t("lookup.newRequest")}
        </Link>
        <Link href="/" className={buttonVariants({ variant: "ghost", size: "touch" })}>
          {t("success.home")}
        </Link>
      </div>
    </div>
  );
}
