"use client";

/**
 * Review Queue page — Web Secretary admin screen (Plan 03-10).
 * Lists pending_review memberships (duplicate flat conflicts) with Approve/Remove actions.
 *
 * Pattern mirrors apps/mobile/app/(protected)/review-queue.jsx (Plan 03-08).
 */

import { fetchPendingReviews, removeMember } from "@parisar/api-client";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PhonePrivacyChip } from "@/components/directory/PhonePrivacyChip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { resolveActiveSociety } from "@/lib/auth/activeSociety";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Group flat members by flat_id → [{flatKey, flatLabel, claimants[]}] */
function groupByFlat(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.flat_id;
    const wingName = row.flats?.wings?.name ?? "";
    const flatNum = row.flats?.number ?? "";
    const flatLabel = [wingName, flatNum].filter(Boolean).join("-");
    if (!map.has(key)) {
      map.set(key, { flatKey: key, flatLabel, claimants: [] });
    }
    map.get(key).claimants.push(row);
  }
  // Only return groups with 2+ claimants (actual conflicts)
  return Array.from(map.values()).filter((g) => g.claimants.length >= 2);
}

const AVATAR_COLORS = [
  { bg: "#DCEFE6", text: "#12715A" },
  { bg: "#f0fdf4", text: "#16a34a" },
  { bg: "#fef3c7", text: "#d97706" },
  { bg: "#fdf2f8", text: "#db2777" },
];

function getAvatarColor(name = "") {
  const idx = (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// ClaimantRow — one of the conflicting members
// ---------------------------------------------------------------------------
function ClaimantRow({ member, joinedLabel }) {
  const name = member?.profiles?.full_name ?? "Member";
  const status = member?.status ?? "pending_review";
  const colors = getAvatarColor(name);

  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar className="size-9 shrink-0" style={{ backgroundColor: colors.bg }}>
        <AvatarFallback style={{ backgroundColor: colors.bg, color: colors.text }}>
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-medium text-[var(--color-neutral-900)] truncate">
            {name}
          </span>
          {status === "active" ? (
            <Badge className="bg-emerald-500 text-white text-xs">Active</Badge>
          ) : (
            <Badge className="bg-amber-500 text-white text-xs">Pending</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--color-neutral-600)]">
          <PhonePrivacyChip targetUserId={member?.user_id} />
          {joinedLabel ? (
            <span className="text-[var(--color-neutral-400)]">{joinedLabel}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConflictCard — one flat conflict
// ---------------------------------------------------------------------------
function ConflictCard({ group, onApprove, onRemoveBoth, processingKey }) {
  const { t } = useTranslation("auth");
  const isProcessing = processingKey === group.flatKey;

  return (
    <div className="bg-white rounded-xl p-5 mb-3 border border-[var(--color-neutral-200)]">
      {/* Flat heading */}
      <h3 className="text-xl font-semibold text-[var(--color-neutral-900)] mb-3">
        Flat {group.flatLabel}
      </h3>

      {/* Claimants */}
      {group.claimants.map((member, idx) => {
        const joinedLabel = member.joined_at
          ? `Joined ${new Date(member.joined_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
          : null;
        return (
          <div key={member.id}>
            {idx > 0 && (
              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-[var(--color-neutral-200)]" />
                <span className="text-sm text-[var(--color-neutral-400)]">
                  {t("reviewQueue.vs")}
                </span>
                <div className="flex-1 h-px bg-[var(--color-neutral-200)]" />
              </div>
            )}
            <ClaimantRow member={member} joinedLabel={joinedLabel} />
          </div>
        );
      })}

      {/* Action row */}
      <div className="flex flex-col gap-2 mt-4">
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => onApprove(group, 0)}
          className="h-10 w-full rounded-lg bg-[var(--color-brand-500)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {t("reviewQueue.approveFirst")}
        </button>
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => onApprove(group, 1)}
          className="h-10 w-full rounded-lg border border-[var(--color-brand-500)] text-[var(--color-brand-500)] text-sm font-semibold hover:bg-[var(--color-brand-50)] transition-colors disabled:opacity-50"
        >
          {t("reviewQueue.approveSecond")}
        </button>
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => onRemoveBoth(group)}
          className="text-sm text-[var(--color-danger)] font-medium py-1 hover:underline disabled:opacity-50"
        >
          {t("reviewQueue.removeBoth")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewQueuePage — main page component
// ---------------------------------------------------------------------------
export default function ReviewQueuePage() {
  const { t } = useTranslation("auth");
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingKey, setProcessingKey] = useState(null);
  const [societyId, setSocietyId] = useState(null);

  const supabase = createSupabaseBrowserClient();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { societyId: sid } = await resolveActiveSociety(supabase, user);
      setSocietyId(sid);
      if (!sid) {
        setGroups([]);
        setLoading(false);
        return;
      }
      const rows = await fetchPendingReviews(supabase, sid);
      setGroups(groupByFlat(rows));
    } catch (err) {
      setError(err?.message ?? "Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove(group, approvedIdx) {
    setProcessingKey(group.flatKey);
    setError(null);
    try {
      // Approve = UPDATE approved member to 'active', removeMember for others
      const approvedMember = group.claimants[approvedIdx];
      const rejected = group.claimants.filter((_, i) => i !== approvedIdx);

      // PAR-108: check the approve UPDATE **before** touching the other claimants.
      // Previously the {error} was discarded, so a failed activate followed by
      // successful removals left the flat with nobody active (half-resolved).
      const { error: approveError } = await supabase
        .from("society_memberships")
        .update({ status: "active" })
        .eq("id", approvedMember.id);
      if (approveError) {
        setError(t("auth.networkError"));
        await load(); // resync — never leave the UI asserting a state that didn't apply
        return;
      }

      // Remove all rejected claimants via RPC — collect (don't swallow) failures.
      const removalFailed = [];
      for (const r of rejected) {
        try {
          await removeMember(supabase, r.id);
        } catch {
          removalFailed.push(r.id);
        }
      }
      if (removalFailed.length > 0) setError(t("auth.networkError"));

      // PAR-108: resync from the server instead of optimistically dropping the
      // group — a local filter can hide a half-applied state.
      await load();
    } catch {
      setError(t("auth.networkError"));
      await load();
    } finally {
      setProcessingKey(null);
    }
  }

  async function handleRemoveBoth(group) {
    setProcessingKey(group.flatKey);
    try {
      for (const member of group.claimants) {
        await removeMember(supabase, member.id);
      }
      setGroups((prev) => prev.filter((g) => g.flatKey !== group.flatKey));
    } catch (err) {
      setError(err?.message ?? "Remove failed");
    } finally {
      setProcessingKey(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      {/* Header */}
      <header className="bg-white border-b border-[var(--color-neutral-200)] px-4 h-14 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-[var(--color-neutral-600)] hover:text-[var(--color-neutral-900)] transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-semibold text-[var(--color-neutral-900)]">
          {t("reviewQueue.heading")}
        </h1>
        {groups.length > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-sm font-semibold px-2 py-0.5 min-w-[1.5rem]">
            {groups.length}
          </span>
        )}
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Sub-heading */}
        <p className="text-base text-[var(--color-neutral-600)] mb-6">
          {t("reviewQueue.subheading")}
        </p>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 mb-4 text-sm text-red-700">
            <AlertTriangle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl p-5 mb-3 h-40 animate-pulse"
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {/* Conflict cards */}
        {!loading && groups.length > 0 && (
          <div>
            {groups.map((group) => (
              <ConflictCard
                key={group.flatKey}
                group={group}
                onApprove={handleApprove}
                onRemoveBoth={handleRemoveBoth}
                processingKey={processingKey}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && groups.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <CheckCircle2 size={48} className="text-emerald-500" aria-hidden="true" />
            <h2 className="text-xl font-semibold text-[var(--color-neutral-900)] text-center">
              {t("reviewQueue.resolved")}
            </h2>
          </div>
        )}
      </main>
    </div>
  );
}
