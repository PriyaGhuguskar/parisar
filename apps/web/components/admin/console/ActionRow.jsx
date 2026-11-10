"use client";

import { Plus, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { secondaryCta } from "./constants";

// Action row — the console's "make something" actions, together at the top right
// of the content rather than stacked in the sidebar. They are page-level actions,
// not navigation, so they do not belong in the nav list. Wraps to its own line on
// narrow viewports.
export function ActionRow({ isAdmin, onNewSociety, onAppoint }) {
  const { t } = useTranslation("platform");
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-end gap-2 px-4 pt-4 sm:px-5 sm:pt-5 lg:px-8 lg:pt-8">
      <button
        type="button"
        onClick={onNewSociety}
        className="a-btn a-shine flex min-h-11 items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 font-bold text-[14px] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
      >
        <Plus size={16} strokeWidth={2.6} aria-hidden="true" />
        {t("register.title")}
      </button>

      {/* Appointing platform users is admin-only: createPlatformUser checks
          is_platform_admin() before it touches the service role, and the RPC
          checks again. Sales never see these. */}
      {isAdmin && onAppoint ? (
        <>
          <button
            type="button"
            className={`${secondaryCta} min-h-11`}
            onClick={() => onAppoint("staff")}
          >
            <UserPlus size={15} strokeWidth={2.4} aria-hidden="true" />
            {t("appoint.staffTitle")}
          </button>
          <button
            type="button"
            className={`${secondaryCta} min-h-11`}
            onClick={() => onAppoint("sales")}
          >
            <UserPlus size={15} strokeWidth={2.4} aria-hidden="true" />
            {t("appoint.salesTitle")}
          </button>
        </>
      ) : null}
    </div>
  );
}
