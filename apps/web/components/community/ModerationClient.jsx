"use client";

// ModerationClient — Secretary moderation queue + audit log (web). UI-SPEC Screen 8.
// THE ONLY web surface that renders hidden content (admin-only — D-03 / DD2).
//
// Tabs (the established TabButton idiom — no new shadcn block):
//   - "To review": the merged FIFO ModerationCard list (oldest hidden_at first —
//     the COMM-06 24h obligation) via listModerationQueue; Restore/Confirm-takedown
//     write audit events server-side.
//   - "Audit log": the AuditLogRow list (newest first) via listAuditLog (COMM-07).
//
// Report counts/reasons come from a lightweight reports-table read (admin RLS),
// defensive on failure (count 1, no reasons) — listModerationQueue doesn't embed
// report aggregates (mirrors the mobile moderation queue).
//
// Realtime (subscribeToModerationQueue): a new report flips a post/comment to hidden
// (UPDATE) → re-sync; a co-admin Restore/Takedown removes the card.
//
// PRESENTATION — PageShell + PageHeader with a live count of what is waiting, and
// the tabs promoted to a proper segmented rail so "To review" vs "Audit log" reads
// as two modes rather than two words. The queue is a pk-stagger list so a backlog
// arrives in sequence instead of landing as a wall.

import { listModerationQueue, subscribeToModerationQueue } from "@parisar/api-client";
import { ScrollText, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { EmptyState, PageHeader, PageShell, StatusPill } from "../kit";
import { AuditLogRow } from "./AuditLogRow";
import { ModerationCard } from "./ModerationCard";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2";

function mergeQueue(queue, reportMeta) {
  const posts = (queue?.posts ?? []).map((p) => ({
    ...p,
    targetKind: "post",
    reportCount: reportMeta[p.id]?.count ?? 1,
    reasons: reportMeta[p.id]?.reasons ?? [],
  }));
  const comments = (queue?.comments ?? []).map((cm) => ({
    ...cm,
    targetKind: "comment",
    reportCount: reportMeta[cm.id]?.count ?? 1,
    reasons: reportMeta[cm.id]?.reasons ?? [],
  }));
  // FIFO — oldest hidden_at first (the 24h obligation, COMM-06).
  return [...posts, ...comments].sort((a, b) => {
    const ta = a.hidden_at ? new Date(a.hidden_at).getTime() : 0;
    const tb = b.hidden_at ? new Date(b.hidden_at).getTime() : 0;
    return ta - tb;
  });
}

/**
 * @param {{
 *   initialQueue: { posts: Array, comments: Array },
 *   initialAudit: Array,
 *   societyId: string,
 *   loadError?: string|null,
 * }} props
 */
export function ModerationClient({ initialQueue, initialAudit, societyId, loadError = null }) {
  // "community" is joined only for the back-link label (feedTitle) — moderation
  // stays the default namespace so every other t() call is unchanged.
  const { t } = useTranslation(["moderation", "community"]);
  const [activeTab, setActiveTab] = useState("review"); // 'review' | 'audit'
  const [queue, setQueue] = useState(initialQueue ?? { posts: [], comments: [] });
  const [reportMeta, setReportMeta] = useState({});
  const [resolvedIds, setResolvedIds] = useState(new Set());
  const cleanupRef = useRef(null);

  // Lightweight report-aggregate read (admin RLS), defensive on failure.
  const loadReportMeta = useCallback(async (q) => {
    const ids = [...(q?.posts ?? []), ...(q?.comments ?? [])].map((x) => x.id);
    if (ids.length === 0) {
      setReportMeta({});
      return;
    }
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from("reports")
        .select("target_id, reason")
        .in("target_id", ids);
      const meta = {};
      for (const r of data ?? []) {
        if (!meta[r.target_id]) meta[r.target_id] = { count: 0, reasons: [] };
        meta[r.target_id].count += 1;
        if (r.reason && !meta[r.target_id].reasons.includes(r.reason)) {
          meta[r.target_id].reasons.push(r.reason);
        }
      }
      setReportMeta(meta);
    } catch {
      setReportMeta({});
    }
  }, []);

  // Re-fetch the queue (after a Realtime change).
  const refetchQueue = useCallback(async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      const fresh = await listModerationQueue(supabase);
      setQueue(fresh);
      await loadReportMeta(fresh);
    } catch {
      // Keep the current queue on a transient failure.
    }
  }, [loadReportMeta]);

  useEffect(() => {
    loadReportMeta(initialQueue ?? { posts: [], comments: [] });
  }, [initialQueue, loadReportMeta]);

  useEffect(() => {
    if (!societyId) return undefined;
    const supabase = createSupabaseBrowserClient();
    cleanupRef.current = subscribeToModerationQueue(supabase, societyId, {
      onPostUpdate: () => refetchQueue(),
      onCommentUpdate: () => refetchQueue(),
    });
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [societyId, refetchQueue]);

  function handleResolved(id) {
    setResolvedIds((prev) => new Set(prev).add(id));
  }

  const merged = mergeQueue(queue, reportMeta).filter((it) => !resolvedIds.has(it.id));

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <PageShell>
        <PageHeader
          backHref="/community"
          backLabel={t("community:community.feedTitle")}
          title={t("moderation.title")}
          actions={
            merged.length > 0 ? (
              <StatusPill tone="danger">
                {t("moderation.reportCount").replace("{{n}}", String(merged.length))}
              </StatusPill>
            ) : null
          }
        />

        {/* Tabs — a segmented rail, so the two modes read as a control. */}
        <div className="pk-in mb-6 flex gap-1 rounded-[14px] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] p-1">
          <TabButton
            label={t("moderation.tabReview")}
            active={activeTab === "review"}
            onClick={() => setActiveTab("review")}
          />
          <TabButton
            label={t("moderation.tabAudit")}
            active={activeTab === "audit"}
            onClick={() => setActiveTab("audit")}
          />
        </div>

        {activeTab === "review" ? (
          loadError ? (
            <p
              role="alert"
              className="text-sm font-semibold"
              style={{ color: "var(--color-danger)" }}
            >
              {t("moderation.restoreError")}
            </p>
          ) : merged.length === 0 ? (
            <ReviewEmpty />
          ) : (
            <div className="pk-stagger flex flex-col gap-4">
              {merged.map((item) => (
                <ModerationCard key={item.id} item={item} onResolved={handleResolved} />
              ))}
            </div>
          )
        ) : (initialAudit?.length ?? 0) === 0 ? (
          <EmptyState icon={ScrollText} title={t("moderation.auditEmpty")} />
        ) : (
          <div className="pk-stagger flex flex-col gap-2">
            {initialAudit.map((ev) => (
              <AuditLogRow key={ev.id} event={ev} />
            ))}
          </div>
        )}
      </PageShell>
    </div>
  );
}

function TabButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-[10px] py-2.5 text-sm font-bold transition-colors ${FOCUS_RING} ${
        active
          ? "bg-[var(--color-neutral-0)] text-[var(--color-brand-700)]"
          : "text-[var(--color-neutral-400)] hover:text-[var(--color-neutral-600)]"
      }`}
      style={active ? { boxShadow: "0 1px 2px rgba(18,38,28,.05)" } : undefined}
    >
      {label}
    </button>
  );
}

function ReviewEmpty() {
  const { t } = useTranslation("moderation");
  return (
    <EmptyState
      icon={ShieldCheck}
      title={t("moderation.emptyHeading")}
      description={t("moderation.emptyBody")}
    />
  );
}
