// apps/web/components/dashboard/SocietyHeaderPill.jsx
// The dashboard's page title: the society name next to a small brand-coloured
// building mark, so the name reads as "where you are" rather than plain text.
// (The old "· N% joined" suffix was removed at the user's request — residents
// don't need the sign-up rate.)
//
// JavaScript only — no TypeScript per CLAUDE.md.

"use client";

import { Building2 } from "lucide-react";

/**
 * @param {object} props
 * @param {string} [props.societyName]
 */
export function SocietyHeaderPill({ societyName = "Your Society" }) {
  return (
    <div className="pk-in flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: "var(--color-brand-50)", color: "var(--color-brand-600)" }}
      >
        <Building2 size={20} strokeWidth={2.2} />
      </span>
      <h1
        className="min-w-0 truncate text-[20px] font-semibold capitalize leading-tight tracking-[-0.01em]"
        style={{ color: "var(--color-brand-700)" }}
      >
        {societyName}
      </h1>
    </div>
  );
}
