"use client";

// NoticeListClient — CSR wrapper around the SSR-fetched society-notice list.
//
// Responsibilities (Phase 4 SSR+CSR split + UI-SPEC Screen 1):
//   1. Subscribe to Realtime INSERT for the current society on mount via
//      createSupabaseBrowserClient + subscribeToNotices. New rows get the
//      `animate-slide-down` class for one render pass (Phase 4 CSS contract).
//      In pollsOnly mode the client filter keeps only kind='poll' inserts (DD-1).
//   2. Render the NoticeCard stack (newest first): no left stripe (DD-12), unread
//      dot, AttachmentPill / PollPill hints, OwnerChip "Posted by …" (NOTF-04).
//   3. Board roles see a "New Notice" header button → /notices/new (members never;
//      composer is board-gated NOTF-01).
//   4. Loading skeleton / empty / error states per UI-SPEC.
//
// SSR seed comes from the server component; Realtime mutates the in-memory list.
//
// Read/unread: markNoticeRead is a documented 05-03 fast-follow no-op (no
// notification_reads table yet) — every card renders as unread, the graceful
// degradation the UI-SPEC §Read/Unread Tracking explicitly permits.
//
// Presentation is built on the shared page kit (PageShell / PageHeader /
// SurfaceCard / StatusPill / EmptyState) so notices breathe like the rest of the
// product; the data, realtime and routing behaviour above is untouched.

import { subscribeToNotices } from "@parisar/api-client";
import { formatDistanceToNow } from "date-fns";
import { BarChart3, Bell, Paperclip, Plus, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, PageHeader, PageShell, StatusPill, SurfaceCard } from "@/components/kit";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { OwnerChip } from "../complaints/OwnerChip";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-neutral-50)]";

function formatFlat(flatJoin) {
  if (!flatJoin) return "—";
  const wing = flatJoin?.wing?.name ?? "";
  const num = flatJoin?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

function safeAge(iso) {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

/**
 * @param {{
 *   initialNotices: Array,
 *   societyId: string,
 *   role: string,
 *   loadError?: string|null,
 *   pollsOnly?: boolean,
 * }} props
 */
export function NoticeListClient({
  initialNotices,
  societyId,
  role,
  loadError = null,
  pollsOnly = false,
}) {
  const { t } = useTranslation(["notifications", "polls"]);
  const router = useRouter();
  const isBoard = BOARD_ROLES.has(role);

  const [notices, setNotices] = useState(initialNotices ?? []);
  const [animatedIds, setAnimatedIds] = useState(new Set());
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!societyId) return undefined;
    const supabase = createSupabaseBrowserClient();

    cleanupRef.current = subscribeToNotices(supabase, societyId, {
      onInsert: (row) => {
        // Polls tile is a filtered view (DD-1) — drop non-poll inserts.
        if (pollsOnly && row?.kind !== "poll") return;
        setNotices((prev) => {
          if (prev.some((n) => n.id === row.id)) return prev;
          return [row, ...prev];
        });
        setAnimatedIds((prev) => {
          const next = new Set(prev);
          next.add(row.id);
          return next;
        });
        setTimeout(() => {
          setAnimatedIds((prev) => {
            if (!prev.has(row.id)) return prev;
            const next = new Set(prev);
            next.delete(row.id);
            return next;
          });
        }, 300);
      },
    });

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [societyId, pollsOnly]);

  function handleOpen(notice) {
    router.push(`/notices/${notice.id}`);
  }

  const title = pollsOnly ? t("polls:poll.listTitle") : t("notifications:notice.listTitle");

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <PageShell>
        <PageHeader
          title={title}
          backHref="/dashboard"
          backLabel="Dashboard"
          actions={
            isBoard ? (
              <Link
                href="/notices/new"
                aria-label={t("notifications:notice.composeCta")}
                className={`pk-press pk-shine inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--color-brand-600)] px-4 text-sm font-bold text-white transition-colors hover:bg-[var(--color-brand-700)] ${FOCUS_RING}`}
              >
                <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
                {t("notifications:notice.composeCta")}
              </Link>
            ) : null
          }
        />

        {loadError ? (
          <NoticesError />
        ) : notices.length === 0 ? (
          <NoticesEmpty isBoard={isBoard} pollsOnly={pollsOnly} />
        ) : (
          <div className="pk-stagger flex flex-col gap-3">
            {notices.map((n) => (
              <div key={n.id} className={animatedIds.has(n.id) ? "animate-slide-down" : ""}>
                <NoticeCard notice={n} onClick={handleOpen} />
              </div>
            ))}
          </div>
        )}
      </PageShell>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NoticeCard — mirrors ComplaintCard token (no left stripe, DD-12)
// ---------------------------------------------------------------------------

function NoticeCard({ notice, onClick }) {
  const { t } = useTranslation(["notifications", "polls"]);
  // markNoticeRead is a fast-follow no-op (05-03) → every notice renders unread.
  const unread = true;

  const authorName = notice?.author?.full_name ?? "—";
  const authorFlat = formatFlat(notice?.author_flat);
  const postedByLabel = t("notifications:notice.postedBy")
    .replace("{{name}}", authorName)
    .replace("{{flat}}", authorFlat);

  const age = safeAge(notice?.created_at);

  // polls embed is an array (left join); attachments not embedded on the list query.
  const poll = Array.isArray(notice?.polls) ? notice.polls[0] : notice?.polls;
  const hasPoll = !!poll || notice?.kind === "poll";
  const Icon = hasPoll ? BarChart3 : Bell;

  function handleClick() {
    onClick?.(notice);
  }
  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(notice);
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: card pattern with shadcn-style div + role
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Notice: ${(notice?.title ?? "").slice(0, 60)}`}
      className={`block w-full rounded-[18px] ${FOCUS_RING}`}
    >
      <SurfaceCard interactive className="p-4 sm:p-5">
        <div className="flex gap-3 sm:gap-4">
          <span
            aria-hidden="true"
            className="pk-well flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: "var(--color-brand-50)", color: "var(--color-brand-600)" }}
          >
            <Icon size={19} strokeWidth={2} />
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start gap-2">
              <h2 className="line-clamp-1 min-w-0 flex-1 break-words text-[17px] font-extrabold leading-snug tracking-[-0.02em] text-[var(--color-neutral-900)]">
                {notice?.title ?? ""}
              </h2>
              {unread ? (
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: "var(--color-brand-500)" }}
                />
              ) : null}
              {age ? (
                <span className="shrink-0 truncate text-xs font-semibold text-[var(--color-neutral-400)] tabular-nums">
                  {age}
                </span>
              ) : null}
            </div>

            <p className="line-clamp-2 break-words text-sm leading-relaxed text-[var(--color-neutral-600)]">
              {notice?.body ?? ""}
            </p>

            {hasPoll || notice?.has_attachment ? (
              <div className="flex flex-wrap items-center gap-2">
                {hasPoll ? (
                  <StatusPill tone="done">
                    <BarChart3 size={11} strokeWidth={2.6} aria-hidden="true" />
                    {t("polls:poll.listTitle")}
                  </StatusPill>
                ) : null}
                {notice?.has_attachment ? <AttachmentPill /> : null}
              </div>
            ) : null}

            <OwnerChip ownerName={authorName} ownerFlat={authorFlat} labelText={postedByLabel} />
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}

function AttachmentPill() {
  const { t } = useTranslation(["notifications", "polls"]);
  return (
    <StatusPill tone="neutral">
      <Paperclip size={11} strokeWidth={2.6} aria-hidden="true" />
      {t("notifications:notice.attachmentPdf")}
    </StatusPill>
  );
}

// ---------------------------------------------------------------------------
// Empty / Error states
// ---------------------------------------------------------------------------

function NoticesEmpty({ isBoard, pollsOnly }) {
  const { t } = useTranslation(["notifications", "polls"]);
  const heading = pollsOnly ? t("polls:poll.emptyHeading") : t("notifications:notice.emptyHeading");
  const body = pollsOnly
    ? t("polls:poll.emptyBody")
    : isBoard
      ? t("notifications:notice.emptyBodyBoard")
      : t("notifications:notice.emptyBody");
  const Icon = pollsOnly ? BarChart3 : Bell;

  return (
    <EmptyState
      icon={Icon}
      title={heading}
      description={body}
      action={
        !pollsOnly && isBoard ? (
          <Link
            href="/notices/new"
            className={`pk-press pk-shine inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-[var(--color-brand-600)] px-6 text-[15px] font-bold text-white transition-colors hover:bg-[var(--color-brand-700)] ${FOCUS_RING}`}
          >
            <Plus size={17} strokeWidth={2.4} aria-hidden="true" />
            {t("notifications:notice.composeCta")}
          </Link>
        ) : null
      }
    />
  );
}

function NoticesError() {
  const { t } = useTranslation(["notifications", "polls"]);
  return (
    <EmptyState
      icon={WifiOff}
      title={t("notifications:notice.loadError")}
      description={t("notifications:notice.loadErrorBody")}
      action={
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`pk-press inline-flex h-11 items-center justify-center rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-5 text-sm font-bold text-[var(--color-neutral-900)] transition-colors hover:bg-[var(--color-neutral-100)] ${FOCUS_RING}`}
        >
          Try again
        </button>
      }
    />
  );
}
