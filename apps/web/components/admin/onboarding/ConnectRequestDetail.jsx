"use client";

// One connect request, in the console's side drawer: who to ring, when, every
// authority number, the history, and the actions. Actions appear only while the
// request is open (the RPCs refuse closed ones with REQUEST_CLOSED), so nothing
// here is a control that cannot work.

import { adminGetConnectRequest } from "@parisar/api-client";
import { Phone, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState, LoadingState, Notice, StatusBadge } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { DetailSections } from "./ConnectRequestDetailSections";
import { formatDateTime, isOpenStatus, telHref } from "./lib/requestFormat";
import { errorText, settle } from "./lib/rpc";
import { MarkCalledDialog, RejectDialog, RescheduleDialog } from "./RequestActionDialogs";

const DIALOGS = { called: MarkCalledDialog, reschedule: RescheduleDialog, reject: RejectDialog };

function DetailActions({ request, onDialog, onRegister, t }) {
  const tel = telHref(request.phone);
  return (
    <section aria-label={t("detail.actions")} className="flex flex-wrap gap-2">
      <Button type="button" size="touch" onClick={() => onRegister(request)}>
        {t("detail.register")}
      </Button>
      {tel ? (
        <a
          href={tel}
          aria-label={t("requests.callAria", { name: request.contact_name })}
          className={cn(buttonVariants({ variant: "outline", size: "touch" }))}
        >
          <Phone aria-hidden="true" className="size-4" />
          {t("requests.call")}
        </a>
      ) : null}
      <Button type="button" variant="outline" size="touch" onClick={() => onDialog("called")}>
        {t("detail.markCalled")}
      </Button>
      <Button type="button" variant="outline" size="touch" onClick={() => onDialog("reschedule")}>
        {t("detail.reschedule")}
      </Button>
      <Button type="button" variant="destructive" size="touch" onClick={() => onDialog("reject")}>
        {t("detail.reject")}
      </Button>
    </section>
  );
}

export function ConnectRequestDetail({ requestId, onClose, onChanged, onRegister, onOpenSociety }) {
  const { t, i18n } = useTranslation("platform");
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    const supabase = createSupabaseBrowserClient();
    const res = await settle(() => adminGetConnectRequest(supabase, requestId));
    setState({ data: res.data ?? null, loading: false, error: res.error ?? null });
  }, [requestId]);

  useEffect(() => {
    setNotice(null);
    load();
  }, [load]);

  async function handleDone(updated, kind) {
    setDialog(null);
    const when = formatDateTime(updated?.scheduled_at, i18n.language);
    setNotice(
      kind === "rescheduled"
        ? t("detail.rescheduled", { when: when ?? "" })
        : t(kind === "called" ? "detail.markedCalled" : "detail.rejected"),
    );
    await load();
    onChanged?.();
  }

  const request = state.data;
  const Dialog = dialog ? DIALOGS[dialog] : null;

  return (
    <div className="flex h-full flex-col bg-card">
      <header className="flex items-start justify-between gap-4 border-b border-border p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="type-h2 truncate text-foreground">
            {request?.society_name ?? t("detail.loading")}
          </h2>
          {request ? (
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <span className="type-body-sm tabular-nums text-muted-foreground">
                {t("detail.title", { code: request.request_code })}
              </span>
              <StatusBadge status={request.status} />
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {state.loading && !request ? <LoadingState variant="list" rows={4} /> : null}
        {state.error ? (
          <ErrorState
            description={
              state.error === "generic" ? t("detail.loadError") : errorText(t, state.error)
            }
            onRetry={state.error === "REQUEST_NOT_FOUND" ? undefined : load}
          />
        ) : null}
        {request ? (
          <div className="flex flex-col gap-6">
            {notice ? (
              <Notice tone="success" onDismiss={() => setNotice(null)}>
                {notice}
              </Notice>
            ) : null}
            {isOpenStatus(request.status) ? (
              <DetailActions request={request} onDialog={setDialog} onRegister={onRegister} t={t} />
            ) : (
              <Notice tone="neutral">{t("detail.closedNotice")}</Notice>
            )}
            <DetailSections request={request} onOpenSociety={onOpenSociety} />
          </div>
        ) : null}
      </div>

      {Dialog && request ? (
        <Dialog
          request={request}
          onOpenChange={(open) => (open ? null : setDialog(null))}
          onDone={handleDone}
        />
      ) : null}
    </div>
  );
}
