"use client";

// Dashboard entry points for society authorities (secretary/co-secretary role):
//   - "Add your flat" prompt when their authority membership has no flat yet
//     (they claimed as an authority but haven't onboarded as a resident);
//   - the Society Dashboard card — their society-management hub.
// Residents see nothing here.

import { ChevronRight, Home, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

const AUTHORITY_ROLES = new Set(["secretary", "co_secretary"]);

export function AuthorityEntry({ role, needsFlat = false }) {
  const { t } = useTranslation("auth");
  if (!AUTHORITY_ROLES.has(role)) return null;

  return (
    <section className="mb-6 flex flex-col gap-3">
      {needsFlat ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3"
          style={{ borderColor: "var(--color-warning-500)", backgroundColor: "#fffbeb" }}
          data-testid="authority-add-flat"
        >
          <Home size={20} className="shrink-0 text-[var(--color-warning-700)]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-[var(--color-neutral-900)]">
              {t("authority.addFlatTitle")}
            </p>
            <p className="text-[13px] text-[var(--color-neutral-600)]">
              {t("authority.addFlatBody")}
            </p>
          </div>
          <Link
            href="/onboarding"
            className="pk-press rounded-xl bg-[var(--color-brand-500)] px-4 py-2 text-[14px] font-bold text-white hover:bg-[var(--color-brand-600)]"
          >
            {t("authority.addFlatCta")}
          </Link>
        </div>
      ) : null}

      <Link
        href="/society-dashboard"
        className="pk-press flex items-center gap-3 rounded-2xl border border-[var(--color-neutral-200)] bg-white px-4 py-4 hover:border-[var(--color-brand-500)]"
        data-testid="authority-society-dashboard"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
          <ShieldCheck size={20} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-bold text-[var(--color-neutral-900)]">
            {t("authority.societyDashboard")}
          </span>
          <span className="block text-[13px] text-[var(--color-neutral-600)]">
            {t("authority.societyDashboardLead")}
          </span>
        </span>
        <ChevronRight size={18} className="text-[var(--color-neutral-400)]" aria-hidden="true" />
      </Link>
    </section>
  );
}
