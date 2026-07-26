"use client";

// OwnerChip — inline attribution pill (web). Used across complaints (Phase 4) and
// Phase 5 notices/bookings for "Posted by …" / "Approved by …" attribution.
//
// Attribution is the product's core promise ("Approved by Amit (A-102)"), so the
// chip now sits on a brand tint rather than a grey one: it reads as a person,
// not as metadata. The avatar well is a circle so it scans as a human at a
// glance even before the name is read.
//
// Phase 5 (NOTF-04 / BOOK-06): an optional pre-built `labelText` takes precedence
// over the complaint.ownedBy template so callers can render "Posted by Rahul
// (B-203)" without re-keying. Backward-compatible — complaint callers still pass
// ownerName/ownerFlat and get the "Owned by …" template.
//
// Hidden when ownerName is falsy.

import { User } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * @param {{ ownerName?: string|null, ownerFlat?: string|null, labelText?: string|null }} props
 */
export function OwnerChip({ ownerName, ownerFlat, labelText = null }) {
  const { t } = useTranslation("complaints");
  if (!ownerName) return null;

  const flat = ownerFlat ?? "—";
  const text = labelText ?? t("complaint.ownedBy", { name: ownerName, flat });

  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[12px] font-semibold"
      style={{ backgroundColor: "var(--color-brand-50)", color: "var(--color-brand-700)" }}
      title={text}
    >
      <span
        aria-hidden="true"
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--color-brand-500)", color: "var(--color-neutral-0)" }}
      >
        <User size={10} strokeWidth={2.4} />
      </span>
      <span className="truncate">{text}</span>
    </span>
  );
}
