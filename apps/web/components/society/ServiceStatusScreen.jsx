"use client";

// Full-screen notice shown to a society's members (and guards) when Parisar has
// paused service for their society or blocked it. Shows the admin's reason and
// a way to sign out; nothing else in the app is reachable (the database also
// stops serving the society's data — see migration 050).

import { Ban, PauseCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { signOutAction } from "@/app/actions/auth";

export function ServiceStatusScreen({ status, societyName, reason, changedAt }) {
  const { t } = useTranslation("auth");
  const blocked = status === "blocked";
  const Icon = blocked ? Ban : PauseCircle;
  const society = societyName ?? "";

  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center px-5 py-10"
      style={{ backgroundColor: "var(--color-neutral-50)" }}
      data-testid="service-status-screen"
    >
      <div className="w-full max-w-md rounded-[22px] border border-[var(--color-neutral-200)] bg-white p-7 text-center">
        <span
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: blocked ? "#FCE9E6" : "#FDF0DF",
            color: blocked ? "#94291A" : "#8A4708",
          }}
        >
          <Icon size={28} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-[22px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
          {blocked ? t("service.blockedTitle") : t("service.pausedTitle")}
        </h1>
        <p className="mt-2 text-[15px] text-[var(--color-neutral-600)]">
          {blocked ? t("service.blockedBody", { society }) : t("service.pausedBody", { society })}
        </p>

        {reason ? (
          <div className="mt-5 rounded-2xl bg-[var(--color-neutral-50)] px-4 py-3 text-left">
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--color-neutral-400)]">
              {t("service.reasonLabel")}
            </p>
            <p className="mt-1 whitespace-pre-line text-[15px] text-[var(--color-neutral-900)]">
              {reason}
            </p>
            {changedAt ? (
              <p className="mt-1.5 text-[12px] text-[var(--color-neutral-400)]">
                {t("service.since", {
                  date: new Date(changedAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  }),
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-5 text-[13px] text-[var(--color-neutral-600)]">{t("service.help")}</p>

        <form action={signOutAction} className="mt-5">
          <button
            type="submit"
            className="w-full rounded-xl border border-[var(--color-neutral-200)] px-4 py-2.5 text-[14px] font-bold text-[var(--color-neutral-900)] hover:bg-[var(--color-neutral-100)]"
          >
            {t("auth.logout")}
          </button>
        </form>
      </div>
    </main>
  );
}
