"use client";

// A Connect With Us request as the server returned it: request ID, status and call time.
// Shared by the confirmation after submitting and the status lookup.

import { useTranslation } from "react-i18next";
import { CopyButton, StatusBadge } from "@/components/kit";
import { formatIstDateTime } from "./lib/connectForm";

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="type-body-sm text-muted-foreground sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="type-body min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

const KNOWN_INFO = new Set([
  "new",
  "call_scheduled",
  "rescheduled",
  "contacted",
  "registered",
  "rejected",
  "cancelled",
  "closed",
]);

export function RequestSummary({ request }) {
  const { t, i18n } = useTranslation("connect");
  const lng = i18n?.language ?? "en";
  const scheduled = request.scheduled_at ?? request.preferred_at;
  const scheduledText =
    request.call_now && !request.scheduled_at
      ? t("success.scheduledNow")
      : scheduled
        ? t("success.ist", { time: formatIstDateTime(scheduled, lng) })
        : (request.preferred_slot ?? "");
  const alternateText = request.alternate_at
    ? t("success.ist", { time: formatIstDateTime(request.alternate_at, lng) })
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="type-body-sm text-muted-foreground">{t("success.requestId")}</p>
          <p className="type-h2 break-all tabular-nums text-foreground" data-testid="request-code">
            {request.request_code}
          </p>
        </div>
        <CopyButton value={request.request_code} label={t("success.copy")} />
      </div>
      <dl className="flex flex-col">
        {request.society_name ? (
          <Row label={t("success.society")}>{request.society_name}</Row>
        ) : null}
        <Row label={t("success.status")}>
          <span className="flex flex-col items-start gap-1.5">
            <StatusBadge status={request.status} />
            {KNOWN_INFO.has(request.status) ? (
              <span className="type-body-sm text-muted-foreground">
                {t(`statusInfo.${request.status}`)}
              </span>
            ) : null}
          </span>
        </Row>
        {scheduledText ? <Row label={t("success.scheduled")}>{scheduledText}</Row> : null}
        {alternateText ? <Row label={t("success.alternate")}>{alternateText}</Row> : null}
      </dl>
    </div>
  );
}
