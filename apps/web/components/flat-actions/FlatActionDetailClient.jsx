"use client";

// FlatActionDetailClient — flat-action detail (web). UI-SPEC Screen 2b.
//
// Sections:
//   1. Action header card: (board-only) "Flat {{flat}}" heading + FlatActionKindBadge
//      + full body + "Issued by {{name}} ({{flat}}) at {{time}}" attribution (FLAT-02).
//   2. FineDetailBlock (kind=fine only): amount + due/overdue + status + PDF +
//      LOCKED footer + Acknowledge(member-resident) / Waive(admin-only) action row.
//
// Realtime: subscribeFlatAction (single-row UPDATE) so an Acknowledge/Waive by the
// other party flips the status live.

import { subscribeFlatAction } from "@parisar/api-client";
import { format } from "date-fns";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { FineDetailBlock } from "./FineDetailBlock";
import { FlatActionKindBadge } from "./FlatActionKindBadge";
import { formatFlatLabel } from "./FlatPicker";

function safeAt(iso) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "HH:mm, dd MMM");
  } catch {
    return "";
  }
}

/**
 * @param {{
 *   action: object,
 *   pdf?: { url: string|null, fileName?: string } | null,
 *   isAdmin: boolean,
 *   isMemberResident: boolean,
 *   isBoard: boolean,
 * }} props
 */
export function FlatActionDetailClient({
  action: initialAction,
  pdf = null,
  isAdmin,
  isMemberResident,
  isBoard,
}) {
  const { t } = useTranslation("flat-actions");
  const [action, setAction] = useState(initialAction);
  const cleanupRef = useRef(null);

  useEffect(() => {
    const id = action?.id;
    if (!id) return undefined;
    const supabase = createSupabaseBrowserClient();
    cleanupRef.current = subscribeFlatAction(supabase, {
      id,
      onUpdate: (row) => setAction((prev) => ({ ...prev, ...row })),
    });
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [action?.id]);

  const issuerName = action?.issuer?.full_name ?? "—";
  const issuerFlat = formatFlatLabel(action?.issuer_flat);
  const issuedByAt = t("flatAction.issuedByAt")
    .replace("{{name}}", issuerName)
    .replace("{{flat}}", issuerFlat)
    .replace("{{time}}", safeAt(action?.created_at));

  const targetFlat = formatFlatLabel(action?.flat);
  const isFine = action?.kind === "fine";

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <header className="bg-white border-b border-neutral-200 px-4 h-14 flex items-center gap-3">
        <Link
          href="/flat-actions"
          className="text-sm text-[#0E5A48] hover:underline"
          aria-label="Back to flat actions"
        >
          ← Back
        </Link>
        <h1 className="text-xl font-semibold text-[#171717] truncate">
          {t("flatAction.detailTitle")}
        </h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* Section 1 — action header card */}
        <section className="bg-white rounded-xl p-6 flex flex-col gap-3">
          {isBoard ? (
            <h2 className="text-xl font-semibold text-[#171717]">Flat {targetFlat}</h2>
          ) : null}
          <div className="flex items-center gap-2 flex-wrap">
            <FlatActionKindBadge kind={action?.kind} />
          </div>
          <p
            className="text-base text-[#171717] whitespace-pre-wrap break-words"
            style={{ lineHeight: 1.5 }}
          >
            {action?.body ?? ""}
          </p>
          <p className="text-sm text-[#525252]">{issuedByAt}</p>
        </section>

        {/* Section 2 — fine detail block (LOCKED footer + Acknowledge/Waive) */}
        {isFine ? (
          <FineDetailBlock
            action={action}
            pdf={pdf}
            isAdmin={isAdmin}
            isMemberResident={isMemberResident}
            onStatusChange={(next) => setAction(next)}
          />
        ) : null}
      </main>
    </div>
  );
}
