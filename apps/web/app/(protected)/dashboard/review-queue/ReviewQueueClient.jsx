"use client";

/**
 * Review Queue UI — Web Secretary admin screen (Plan 03-10).
 * Lists pending_review memberships (duplicate flat conflicts) with Approve/Remove actions.
 *
 * Rendered by the server page.jsx in this folder, which role-gates it
 * (secretary / co-secretary only) and passes the active societyId.
 *
 * Approve / reject go through the atomic RPCs from migration 054 —
 * approve_pending_membership (approves one claimant and rejects every other
 * pending claimant on that flat in ONE transaction) and
 * reject_pending_membership. Direct `society_memberships.update` is revoked.
 *
 * Pattern mirrors apps/mobile/app/(protected)/review-queue.jsx (Plan 03-08).
 */

import { fetchPendingReviews } from "@parisar/api-client";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PhonePrivacyChip } from "@/components/directory/PhonePrivacyChip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/i18n/date-locale";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Another secretary already resolved this claimant — not a failure, just stale.
const BENIGN_RPC_ERRORS = ["NOT_PENDING", "MEMBERSHIP_NOT_FOUND"];

function isBenignRpcError(error) {
  const msg = String(error?.message ?? "");
  return BENIGN_RPC_ERRORS.some((code) => msg.includes(code));
}

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
    const existing = map.get(key);
    map.set(key, {
      flatKey: key,
      flatLabel: existing?.flatLabel ?? flatLabel,
      claimants: [...(existing?.claimants ?? []), row],
    });
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
  const { t } = useTranslation("auth");
  const name = member?.profiles?.full_name ?? t("profile.roleMember");
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
            <Badge className="bg-emerald-500 text-white text-xs">
              {t("reviewQueue.statusActive")}
            </Badge>
          ) : (
            <Badge className="bg-amber-500 text-white text-xs">
              {t("reviewQueue.statusPending")}
            </Badge>
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
  const { t, i18n } = useTranslation("auth");
  const isProcessing = processingKey === group.flatKey;

  return (
    <div className="bg-white rounded-xl p-5 mb-3 border border-[var(--color-neutral-200)]">
      {/* Flat heading */}
      <h3 className="text-xl font-semibold text-[var(--color-neutral-900)] mb-3">
        {t("reviewQueue.flatHeading", { flat: group.flatLabel })}
      </h3>

      {/* Claimants */}
      {group.claimants.map((member, idx) => {
        const joinedDate = formatDate(member.joined_at, i18n.language, {
          day: "numeric",
          month: "short",
        });
        const joinedLabel = joinedDate ? t("reviewQueue.joinedOn", { date: joinedDate }) : null;
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
// ReviewQueueClient — main UI (role-gated by the server page.jsx)
// ---------------------------------------------------------------------------
/**
 * @param {object} props
 * @param {string} props.societyId  active society, resolved server-side
 */
export function ReviewQueueClient({ societyId }) {
  const { t } = useTranslation("auth");
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingKey, setProcessingKey] = useState(null);

  const supabase = createSupabaseBrowserClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!societyId) {
        setGroups([]);
        return;
      }
      const rows = await fetchPendingReviews(supabase, societyId);
      setGroups(groupByFlat(rows));
    } catch (err) {
      console.error("[review-queue] load failed:", err?.message ?? err);
      setError(t("auth.networkError"));
    } finally {
      setLoading(false);
    }
  }, [supabase, societyId, t]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Run one review RPC; true when it applied (or was already resolved
   * elsewhere), false on a real failure. supabase-js RESOLVES with `{ error }`
   * on RPC failures rather than throwing, so the error is checked explicitly.
   */
  async function runReviewRpc(name, membershipId) {
    try {
      const { error: rpcError } = await supabase.rpc(name, { p_membership_id: membershipId });
      if (!rpcError || isBenignRpcError(rpcError)) return true;
      console.error(`[review-queue] ${name} failed:`, rpcError.message);
      return false;
    } catch (err) {
      console.error(`[review-queue] ${name} threw:`, err?.message ?? err);
      return false;
    }
  }

  async function handleApprove(group, approvedIdx) {
    const approvedMember = group.claimants[approvedIdx];
    if (!approvedMember) return;
    setProcessingKey(group.flatKey);
    setError(null);
    try {
      // ONE atomic call: approves this claimant and rejects every other pending
      // claimant on the flat (PAR-108 — no half-resolved flats).
      const ok = await runReviewRpc("approve_pending_membership", approvedMember.id);
      if (!ok) setError(t("auth.networkError"));
    } finally {
      // Always resync from the server — never leave the UI asserting a state
      // that didn't apply.
      await load();
      setProcessingKey(null);
    }
  }

  async function handleRemoveBoth(group) {
    setProcessingKey(group.flatKey);
    setError(null);
    try {
      // reject_pending_membership (not remove_member): a rejected claimant may
      // re-apply, and their profile is not DPDP-redacted.
      const results = [];
      for (const member of group.claimants) {
        results.push(await runReviewRpc("reject_pending_membership", member.id));
      }
      if (results.includes(false)) setError(t("auth.networkError"));
    } finally {
      await load();
      setProcessingKey(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      {/* Header */}
      <header className="bg-white border-b border-[var(--color-neutral-200)] px-4 h-14 flex items-center gap-3">
        <Link
          href="/dashboard"
          // A bare 20px icon is a 20x20 target — below the 24px WCAG 2.2 AA
          // floor and far below a comfortable thumb. -ml-2 keeps it optically
          // aligned with the header edge while the padding does the work.
          className="-ml-2 flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full text-[var(--color-neutral-600)] transition-colors hover:text-[var(--color-neutral-900)]"
          aria-label={t("common.backToDashboard")}
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
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 mb-4 text-sm text-red-700"
          >
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
