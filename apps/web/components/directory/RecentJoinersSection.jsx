// apps/web/components/directory/RecentJoinersSection.jsx
// D-03 web mirror of apps/mobile/components/directory/RecentJoinersSection.jsx.
// Top "Recently joined" section on the Member Directory page: last 5 joiners,
// avatar (Wave 0 lib/avatar.js color cycle) + name + flat + relative-time-ago.
//
// Shape note: fetchRecentJoiners returns the embedded PostgREST shape
//   { id, user_id, joined_at, profiles: { full_name }, flats: { number, wings: { name } } }
// derived: name = profiles.full_name, flat = `${wings.name}-${number}`.
//
// Silent failure (D-03): empty result OR fetch rejection -> render nothing.
//
// VISUAL NOTE: this is a secondary band above the main list, so it stays a single
// grouped SurfaceCard with an UPPERCASE eyebrow rather than an h1-weight heading —
// it must never compete with the directory title for first read.
//
// JavaScript only — no TypeScript per CLAUDE.md.

"use client";

import { fetchRecentJoiners } from "@parisar/api-client";
import { formatDistanceToNow } from "date-fns";
import { UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { SurfaceCard } from "@/components/kit";
import { getAvatarColor, initials } from "@/lib/avatar";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * @param {object|null|undefined} flats
 * @returns {string}
 */
function flatLabel(flats) {
  const number = flats?.number;
  const wing = flats?.wings?.name;
  if (wing && number) return `${wing}-${number}`;
  if (number) return String(number);
  return "—";
}

/**
 * @param {object} props
 * @param {string|null|undefined} props.societyId
 */
export function RecentJoinersSection({ societyId }) {
  const [joiners, setJoiners] = useState(null);

  useEffect(() => {
    if (!societyId) {
      setJoiners([]);
      return;
    }
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    fetchRecentJoiners(supabase, societyId, 5)
      .then((data) => {
        if (!cancelled) setJoiners(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setJoiners([]);
      });
    return () => {
      cancelled = true;
    };
  }, [societyId]);

  if (!joiners || joiners.length === 0) return null;

  return (
    <section className="pk-in mb-6">
      <h2 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.13em] text-[var(--color-brand-600)]">
        <UserPlus size={13} strokeWidth={2.4} aria-hidden="true" />
        Recently joined
      </h2>
      <SurfaceCard className="overflow-hidden">
        {joiners.map((j, idx) => {
          const name = j.profiles?.full_name ?? "Member";
          const flat = flatLabel(j.flats);
          const joinedAt = j.joined_at ? new Date(j.joined_at) : null;
          const timeAgo =
            joinedAt && !Number.isNaN(joinedAt.getTime())
              ? formatDistanceToNow(joinedAt, { addSuffix: true })
              : "";
          const color = getAvatarColor(name);
          const isLast = idx === joiners.length - 1;

          return (
            <div
              key={j.user_id ?? j.id ?? `${name}-${idx}`}
              className={[
                "flex items-center gap-3 px-4 py-3",
                isLast ? "" : "border-b border-[var(--color-neutral-100)]",
              ].join(" ")}
            >
              <div
                aria-hidden="true"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                style={{ backgroundColor: color.bg, color: color.text }}
              >
                {initials(name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold tracking-[-0.01em] text-[var(--color-neutral-900)]">
                  {name}
                </div>
                <div className="truncate text-[12.5px] text-[var(--color-neutral-400)]">
                  <span className="font-semibold text-[var(--color-brand-600)]">{flat}</span>
                  {timeAgo ? ` · ${timeAgo}` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </SurfaceCard>
    </section>
  );
}
