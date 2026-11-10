"use client";

// Read-only body of the request drawer: contact, authority numbers, slots, message,
// outcome and history. Split from ConnectRequestDetail so each file stays small.

import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  displayPhone,
  formatDateTime,
  historyActionKey,
  localDigits,
  telHref,
} from "./lib/requestFormat";

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
      <dt className="type-body-sm shrink-0 text-muted-foreground sm:w-40">{label}</dt>
      <dd className="type-body min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

function PhoneLink({ phone }) {
  const tel = telHref(phone);
  const text = displayPhone(phone);
  if (!tel) return <span className="tabular-nums">{text}</span>;
  return (
    <a
      href={tel}
      className="focus-ring rounded font-medium tabular-nums text-primary hover:underline"
    >
      {text}
    </a>
  );
}

function Numbers({ request, t }) {
  const contact = localDigits(request.phone);
  const listed = Array.isArray(request.authority_numbers) ? request.authority_numbers : [];
  const rows = listed.length > 0 ? listed : [{ name: request.contact_name, phone: request.phone }];
  return (
    <section>
      <h3 className="type-h3 text-foreground">{t("detail.numbers")}</h3>
      <p className="type-body-sm mt-1 text-muted-foreground">{t("detail.numbersHint")}</p>
      <ul className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border">
        {rows.map((row) => (
          <li
            key={localDigits(row.phone) || row.phone}
            className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
          >
            <span className="type-body text-foreground">
              {row.name || <span className="text-muted-foreground">{t("detail.unnamed")}</span>}
              {localDigits(row.phone) === contact ? (
                <span className="type-caption ml-2 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                  {t("detail.contactTag")}
                </span>
              ) : null}
            </span>
            <PhoneLink phone={row.phone} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function historyDetail(entry, lng) {
  const payload = entry.payload ?? {};
  if (payload.reason) return payload.reason;
  const parts = [];
  if (payload.scheduled_at) parts.push(formatDateTime(payload.scheduled_at, lng));
  if (payload.note) parts.push(payload.note);
  return parts.filter(Boolean).join(" · ") || null;
}

function History({ history, t, lng }) {
  return (
    <section>
      <h3 className="type-h3 text-foreground">{t("detail.history")}</h3>
      {history.length === 0 ? (
        <p className="type-body-sm mt-2 text-muted-foreground">{t("detail.historyEmpty")}</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3 border-l border-border pl-4">
          {history.map((entry, index) => {
            const detail = historyDetail(entry, lng);
            return (
              <li key={`${entry.at}-${index}`} className="flex flex-col gap-0.5">
                <span className="type-body font-medium text-foreground">
                  {t(`detail.historyAction.${historyActionKey(entry.action)}`, {
                    defaultValue: t("detail.historyAction.unknown"),
                  })}
                </span>
                <span className="type-body-sm text-muted-foreground">
                  {formatDateTime(entry.at, lng)}
                  {entry.actor_name
                    ? ` · ${t("detail.historyBy", { name: entry.actor_name })}`
                    : ""}
                </span>
                {detail ? <span className="type-body-sm text-foreground">{detail}</span> : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function DetailSections({ request, onOpenSociety }) {
  const { t, i18n } = useTranslation("platform");
  const lng = i18n.language;
  const none = <span className="text-muted-foreground">{t("common.none")}</span>;
  const when = (value) => formatDateTime(value, lng) ?? none;

  return (
    <>
      <dl className="divide-y divide-border">
        <Field label={t("detail.contact")}>
          <span className="flex flex-col">
            {request.contact_name}
            <PhoneLink phone={request.phone} />
          </span>
        </Field>
        <Field label={t("detail.email")}>
          {request.email ? (
            <a
              href={`mailto:${request.email}`}
              className="focus-ring rounded text-primary hover:underline"
            >
              {request.email}
            </a>
          ) : (
            none
          )}
        </Field>
        <Field label={t("detail.preferred")}>
          {request.call_now ? t("common.callNow") : when(request.preferred_at)}
        </Field>
        {request.alternate_at ? (
          <Field label={t("detail.alternate")}>{when(request.alternate_at)}</Field>
        ) : null}
        {request.scheduled_at ? (
          <Field label={t("detail.scheduled")}>{when(request.scheduled_at)}</Field>
        ) : null}
        {request.reschedule_count > 0 ? (
          <Field label={t("detail.rescheduleCount")}>
            <span className="tabular-nums">{request.reschedule_count}</span>
          </Field>
        ) : null}
        {request.called_at ? (
          <Field label={t("detail.calledAt")}>{when(request.called_at)}</Field>
        ) : null}
        <Field label={t("detail.submitted")}>{when(request.created_at)}</Field>
        {request.message ? (
          <Field label={t("detail.message")}>
            <span className="whitespace-pre-line">{request.message}</span>
          </Field>
        ) : null}
        {request.rejected_reason ? (
          <Field label={t("detail.rejectedReason")}>{request.rejected_reason}</Field>
        ) : null}
        {request.society ? (
          <Field label={t("detail.registeredSociety")}>
            <span className="flex flex-wrap items-center gap-3">
              <span>
                {request.society.name}
                {request.society.code ? (
                  <span className="ml-2 font-medium tabular-nums">{request.society.code}</span>
                ) : null}
              </span>
              {onOpenSociety ? (
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  onClick={() => onOpenSociety(request.society.id)}
                >
                  {t("detail.openSociety")}
                </Button>
              ) : null}
            </span>
          </Field>
        ) : null}
      </dl>
      <Numbers request={request} t={t} />
      <History history={request.history ?? []} t={t} lng={lng} />
    </>
  );
}
