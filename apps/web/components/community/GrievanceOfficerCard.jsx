// GrievanceOfficerCard — read-only Grievance Officer surface for About/Help (web).
// UI-SPEC Screen 9b (COMM-05 / D-06). Surfaces the named officer (defaults to the
// Secretary via the server COALESCE) to satisfy the IT Rules 2021 obligation.
//
// Contact is a tappable mailto:/tel: anchor (email → mailto, else tel).

"use client";

import { Scale } from "lucide-react";
import { useTranslation } from "react-i18next";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function contactHref(contact) {
  const v = (contact ?? "").trim();
  if (!v) return null;
  if (EMAIL_RE.test(v)) return `mailto:${v}`;
  return `tel:${v.replace(/\s/g, "")}`;
}

/**
 * @param {{ officer?: { name?: string, contact?: string, is_default?: boolean } | null }} props
 */
export function GrievanceOfficerCard({ officer }) {
  const { t } = useTranslation("moderation");
  const name = officer?.name ?? "—";
  const contact = officer?.contact ?? "";
  const href = contactHref(contact);

  return (
    <div className="bg-white rounded-xl p-6 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Scale size={16} color="#525252" aria-hidden="true" />
        <span className="text-sm text-[#525252]">{t("grievance.cardLabel")}</span>
      </div>
      <h2 className="text-xl font-semibold text-[#171717]">{name}</h2>
      {contact ? (
        href ? (
          <a href={href} className="text-base text-[#0E5A48] hover:underline break-all">
            {contact}
          </a>
        ) : (
          <span className="text-base text-[#0E5A48] break-all">{contact}</span>
        )
      ) : null}
      <p className="text-sm text-[#6e6e6e]">{t("grievance.cardNote")}</p>
    </div>
  );
}
