"use client";

import { useTranslation } from "react-i18next";

/**
 * Web Society Preview card — shown inline in the /join/code page
 * after a valid code is entered.
 *
 * Props:
 *   society     — { society_id, name, address, member_count }
 *   onConfirm   — function() — "Yes, join"
 *   onWrong     — function() — "Wrong society?"
 */
export default function SocietyPreview({ society, onConfirm, onWrong }) {
  const { t } = useTranslation("auth");
  if (!society) return null;

  const { name = "", address = "", member_count = 0 } = society;

  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase() || name.slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col gap-4">
      {/* Society card */}
      <div className="bg-[var(--color-neutral-0)] rounded-2xl p-6 shadow-sm flex flex-col items-center gap-4">
        {/* Initials circle */}
        <div
          className="w-[72px] h-[72px] rounded-full flex items-center justify-center"
          style={{ backgroundColor: "var(--color-brand-500)" }}
        >
          <span className="text-[28px] font-semibold text-white">{initials}</span>
        </div>

        {/* Society name */}
        <h2 className="text-xl font-semibold text-[var(--color-neutral-900)] text-center">
          {name}
        </h2>

        {/* Address */}
        <p className="text-base text-[var(--color-neutral-600)] text-center">{address}</p>

        {/* Member count */}
        <p className="text-sm text-[var(--color-neutral-400)]">
          {(t("join.previewMemberCount") ?? "").replace("{{count}}", String(member_count))}
        </p>

        {/* Divider */}
        <div className="w-full h-px bg-[var(--color-neutral-200)]" />

        {/* Confirm copy */}
        <p className="text-base text-[var(--color-neutral-900)] text-center">
          {(t("join.confirmJoin") ?? "").replace("{{societyName}}", name)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <button
          onClick={onConfirm}
          className="h-12 w-full rounded-xl font-semibold text-white text-base transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--color-brand-500)" }}
        >
          {t("join.confirmYes")}
        </button>
        <button
          onClick={onWrong}
          className="text-sm text-[var(--color-neutral-600)] hover:underline underline-offset-2 py-2 text-center"
        >
          {t("join.wrongSociety")}
        </button>
      </div>
    </div>
  );
}
