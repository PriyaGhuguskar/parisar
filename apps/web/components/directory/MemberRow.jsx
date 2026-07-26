"use client";

/**
 * MemberRow — directory list row (Plan 03-10).
 *
 * Props:
 *   membership      {object}  society_memberships row joined with profiles, flats, wings
 *   currentUserRole {string}  'secretary' | 'co_secretary' | 'board_member' | 'member'
 *
 * PhonePrivacyChip B-5 fix: both secretary and member modes call revealPhone() RPC.
 * NO secretaryPhone bypass prop is passed to PhonePrivacyChip.
 * Chip receives only `targetUserId` — all reveals go through the RPC and write audit_log.
 *
 * VISUAL NOTE: the row is a SurfaceCard, not a divider-separated list item. A resident
 * is a person, and each card carries a tappable target plus a control (phone reveal)
 * that must not read as part of the navigation — the card lifts, the chip does not.
 */

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { PhonePrivacyChip } from "@/components/directory/PhonePrivacyChip";
import { SurfaceCard } from "@/components/kit";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getAvatarColor, initials } from "@/lib/avatar";

// ---------------------------------------------------------------------------
// MemberRow
// ---------------------------------------------------------------------------
export function MemberRow({ membership, currentUserRole }) {
  const { t } = useTranslation("auth");
  const name = membership?.profiles?.full_name ?? "Member";
  const flatNum = membership?.flats?.number ?? "";
  const wing = membership?.flats?.wings?.name ?? "";
  const flatLabel = [wing, flatNum].filter(Boolean).join("-");
  const residency = membership?.residency_type ?? membership?.residency ?? null;
  const userId = membership?.user_id;
  const membershipId = membership?.id;

  const colors = getAvatarColor(name);
  const residencyLabel = residency === "tenant" ? t("directory.tenant") : t("directory.owner");

  return (
    <SurfaceCard interactive className="group relative">
      <div className="flex items-center gap-3.5 p-3.5 sm:gap-4 sm:p-4">
        {/* Avatar */}
        <Avatar className="size-11 shrink-0" style={{ backgroundColor: colors.bg }}>
          <AvatarFallback
            className="text-sm font-bold"
            style={{ backgroundColor: colors.bg, color: colors.text }}
          >
            {initials(name)}
          </AvatarFallback>
        </Avatar>

        {/* Name + flat + residency. The Link stretches over the card so the whole
            row navigates, while the phone chip sits above it in the stack. */}
        <div className="min-w-0 flex-1">
          <Link
            href={`/dashboard/directory/${membershipId}`}
            className="after:absolute after:inset-0 after:rounded-[18px] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[var(--color-brand-500)] focus-visible:after:ring-offset-2"
          >
            <p className="truncate text-[15px] font-bold tracking-[-0.01em] text-[var(--color-neutral-900)]">
              {name}
            </p>
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {flatLabel ? (
              <span className="text-[13px] font-semibold tabular-nums text-[var(--color-brand-600)]">
                {flatLabel}
              </span>
            ) : null}
            {residency ? (
              <span className="inline-flex items-center rounded-full bg-[var(--color-neutral-100)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-neutral-600)]">
                {residencyLabel}
              </span>
            ) : null}
          </div>
        </div>

        {/* PhonePrivacyChip — NO secretaryPhone bypass; all reveals go through RPC */}
        {userId ? (
          <div
            onClick={(e) => {
              // Prevent the Link navigation when interacting with the chip
              e.preventDefault();
              e.stopPropagation();
            }}
            className="relative z-10 shrink-0"
          >
            <PhonePrivacyChip targetUserId={userId} />
          </div>
        ) : null}

        <ChevronRight
          size={17}
          strokeWidth={2.2}
          aria-hidden="true"
          className="hidden shrink-0 text-[var(--color-neutral-200)] transition-colors group-hover:text-[var(--color-brand-500)] sm:block"
        />
      </div>
    </SurfaceCard>
  );
}
