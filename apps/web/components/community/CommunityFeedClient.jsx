"use client";

// CommunityFeedClient — CSR wrapper around the SSR-fetched community feed (web).
// UI-SPEC Screen 4.
//
// CRITICAL (D-03 / DD1): the feed renders EXACTLY what the RLS-scoped listPosts
// query returns. There is NO client-side hide logic — a reported post is filtered
// out server-side (hidden_at) and simply never arrives / disappears via the
// Realtime event. The ONE allowed client-side optimistic state is the reporter's
// own item swapping to a HiddenPendingBanner after they report it.
//
// Realtime (subscribeToFeed): INSERT prepends; UPDATE merges; DELETE removes — the
// client computes nothing about hidden-ness.
//
// Admin (secretary/co_secretary): a ShieldAlert header action opens the moderation
// queue (NOT a tile/tab).
//
// PRESENTATION — this is a social feed, so it is built as a community board, not a
// table: PageShell + PageHeader with "New Post" as the top-right primary action,
// posts as SurfaceCards inside a pk-stagger container so they arrive in sequence
// as you scroll, and the kit EmptyState inviting the very first post.

import { subscribeToFeed } from "@parisar/api-client";
import { formatDistanceToNow } from "date-fns";
import { Flag, MessageCircle, MoreVertical, Plus, ShieldAlert, Users2, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { deletePostAction } from "../../app/(protected)/community/actions";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { OwnerChip } from "../complaints/OwnerChip";
import { EmptyState, PageHeader, PageShell } from "../kit";
import { HiddenPendingBanner } from "./HiddenPendingBanner";
import { PostTypeChip } from "./PostTypeChip";
import { ReportReasonSheet } from "./ReportReasonSheet";

const ADMIN_ROLES = new Set(["co_secretary", "secretary"]);

// Shared focus treatment — every interactive element in the feed keeps a visible ring.
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2";

function flatLabel(flatJoin) {
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

function commentCountOf(post) {
  const cc = post?.comment_count;
  if (Array.isArray(cc)) return cc[0]?.count ?? 0;
  if (typeof cc === "number") return cc;
  return cc?.count ?? 0;
}

/**
 * @param {{
 *   initialPosts: Array,
 *   societyId: string,
 *   role: string,
 *   userId: string,
 *   loadError?: string|null,
 * }} props
 */
export function CommunityFeedClient({ initialPosts, societyId, role, userId, loadError = null }) {
  // "dashboard" is joined only for the back-link label (nav.home) — community stays
  // the default namespace so every other t() call is unchanged.
  const { t } = useTranslation(["community", "dashboard"]);
  const router = useRouter();
  const isAdmin = ADMIN_ROLES.has(role);

  const [posts, setPosts] = useState(initialPosts ?? []);
  const [animatedIds, setAnimatedIds] = useState(new Set());
  // Posts the CURRENT user just reported → show the optimistic HiddenPendingBanner
  // inline (reporter-only — everyone else loses the row server-side, D-03).
  const [reportedIds, setReportedIds] = useState(new Set());
  const [reportTarget, setReportTarget] = useState(null); // { targetKind, targetId }
  // PAR-103: surfaced failure for the delete write path (was fire-and-forget).
  const [actionError, setActionError] = useState(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!societyId) return undefined;
    const supabase = createSupabaseBrowserClient();
    cleanupRef.current = subscribeToFeed(supabase, societyId, {
      onInsert: (row) => {
        setPosts((prev) => {
          if (prev.some((p) => p.id === row.id)) return prev;
          return [row, ...prev];
        });
        setAnimatedIds((prev) => new Set(prev).add(row.id));
        setTimeout(() => {
          setAnimatedIds((prev) => {
            if (!prev.has(row.id)) return prev;
            const next = new Set(prev);
            next.delete(row.id);
            return next;
          });
        }, 300);
      },
      onUpdate: (row) => {
        setPosts((prev) => prev.map((p) => (p.id === row.id ? { ...p, ...row } : p)));
      },
      onDelete: (row) => {
        setPosts((prev) => prev.filter((p) => p.id !== row.id));
      },
    });
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [societyId]);

  function openPost(post) {
    router.push(`/community/${post.id}`);
  }

  function handleReported() {
    if (reportTarget?.targetId) {
      setReportedIds((prev) => new Set(prev).add(reportTarget.targetId));
    }
  }

  async function handleDeletePost(postId) {
    setActionError(null);
    try {
      const res = await deletePostAction(postId);
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
      } else {
        // PAR-103: the delete was fire-and-forget — on failure the post silently
        // stayed on screen with no feedback. Surface it so the user can retry.
        setActionError(t("community.deleteError"));
      }
    } catch {
      setActionError(t("community.deleteError"));
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <PageShell>
        <PageHeader
          backHref="/dashboard"
          backLabel={t("dashboard:nav.home")}
          title={t("community.feedTitle")}
          actions={
            <>
              {isAdmin ? (
                <Link
                  href="/community/moderation"
                  aria-label="Moderation queue"
                  className={`pk-press inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-[var(--color-neutral-600)] transition-colors hover:border-[var(--color-brand-500)] hover:text-[var(--color-brand-600)] ${FOCUS_RING}`}
                >
                  <ShieldAlert size={19} strokeWidth={2} aria-hidden="true" />
                </Link>
              ) : null}
              <Link
                href="/community/new"
                aria-label={t("community.newPostCta")}
                className={`pk-press pk-shine inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[15px] font-bold text-white ${FOCUS_RING}`}
                style={{
                  backgroundColor: "var(--color-brand-600)",
                  boxShadow: "0 12px 32px -12px rgba(18,113,90,.45)",
                }}
              >
                <Plus size={17} strokeWidth={2.6} aria-hidden="true" />
                {t("community.newPostCta")}
              </Link>
            </>
          }
        />

        {actionError ? (
          <div
            role="alert"
            className="pk-in mb-4 flex items-center gap-2 rounded-[14px] border px-4 py-3 text-sm font-semibold"
            style={{
              borderColor: "var(--color-danger)",
              backgroundColor: "#FCE9E6",
              color: "#94291A",
            }}
          >
            {actionError}
          </div>
        ) : null}

        {loadError ? (
          <FeedErrorState />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={Users2}
            title={t("community.emptyHeading")}
            description={t("community.emptyBody")}
            action={
              <Link
                href="/community/new"
                className={`pk-press pk-shine inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-bold text-white ${FOCUS_RING}`}
                style={{
                  backgroundColor: "var(--color-brand-600)",
                  boxShadow: "0 12px 32px -12px rgba(18,113,90,.45)",
                }}
              >
                <Plus size={17} strokeWidth={2.6} aria-hidden="true" />
                {t("community.newPostCta")}
              </Link>
            }
          />
        ) : (
          <div className="pk-stagger flex flex-col gap-3">
            {posts.map((p) =>
              reportedIds.has(p.id) ? (
                <HiddenPendingBanner key={p.id} />
              ) : (
                <div key={p.id} className={animatedIds.has(p.id) ? "animate-slide-down" : ""}>
                  <PostCard
                    post={p}
                    isAuthor={p.author_id === userId}
                    commentCount={commentCountOf(p)}
                    onOpen={openPost}
                    onReport={() => setReportTarget({ targetKind: "post", targetId: p.id })}
                    onDelete={() => handleDeletePost(p.id)}
                  />
                </div>
              ),
            )}
          </div>
        )}
      </PageShell>

      {reportTarget ? (
        <ReportReasonSheet
          open={!!reportTarget}
          onOpenChange={(open) => !open && setReportTarget(null)}
          targetKind={reportTarget.targetKind}
          targetId={reportTarget.targetId}
          onReported={handleReported}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PostCard — a SurfaceCard that lifts on hover (pk-tile), so a card you can open
// always looks like one. Attribution leads (who + which flat), the body is the
// largest text, and the comment count sits in a footer rule as the "join in" cue.
// ---------------------------------------------------------------------------

function PostCard({ post, isAuthor, commentCount, onOpen, onReport, onDelete }) {
  // PAR-001 fix: sub-component needs its own t().
  const { t } = useTranslation("community");
  const [menuOpen, setMenuOpen] = useState(false);
  const authorName = post?.author?.full_name ?? "—";
  const authorFlat = flatLabel(post?.author_flat);
  const postedBy = t("community.postedBy")
    .replace("{{name}}", authorName)
    .replace("{{flat}}", authorFlat);
  const age = safeAge(post?.created_at);

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen?.(post);
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: card pattern with div + role
    // NOTE: this is a hand-rolled SurfaceCard rather than the kit component because
    // the whole card is the click target — SurfaceCard does not forward handlers.
    // The visual contract (radius / border / surface / shadow / pk-tile) is identical.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(post)}
      onKeyDown={handleKeyDown}
      aria-label={`Post: ${(post?.body ?? "").slice(0, 60)}`}
      className={`pk-tile flex cursor-pointer flex-col gap-3 rounded-[18px] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] p-5 ${FOCUS_RING}`}
      style={{ boxShadow: "0 1px 2px rgba(18,38,28,.05)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <PostTypeChip kind={post?.kind} />
        {age ? (
          <span className="ml-auto shrink-0 text-[13px] font-semibold text-[var(--color-neutral-400)]">
            {age}
          </span>
        ) : null}
        {/* Report (non-author) / overflow Delete (author) */}
        {isAuthor ? (
          <div className="relative">
            <button
              type="button"
              aria-label="Post options"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--color-neutral-400)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-900)] ${FOCUS_RING}`}
            >
              <MoreVertical size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
            {menuOpen ? (
              <div
                className="absolute right-0 top-10 z-10 rounded-[14px] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] p-1"
                style={{ boxShadow: "0 24px 48px -20px rgba(18,38,28,.26)" }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="menu"
                tabIndex={-1}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    if (window.confirm(t("community.deleteConfirm"))) onDelete?.();
                  }}
                  className={`w-full rounded-[10px] px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-[#FCE9E6] ${FOCUS_RING}`}
                  style={{ color: "var(--color-danger)" }}
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            aria-label={t("community.reportConfirm")}
            onClick={(e) => {
              e.stopPropagation();
              onReport?.();
            }}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--color-neutral-400)] transition-colors hover:bg-[#FCE9E6] hover:text-[var(--color-danger)] ${FOCUS_RING}`}
          >
            <Flag size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
      </div>

      <OwnerChip ownerName={authorName} ownerFlat={authorFlat} labelText={postedBy} />

      <p className="line-clamp-3 break-words text-[15px] leading-relaxed text-[var(--color-neutral-900)]">
        {post?.body ?? ""}
      </p>

      <div className="flex items-center gap-1.5 border-t border-[var(--color-neutral-200)] pt-3 text-[var(--color-neutral-400)]">
        <MessageCircle size={15} strokeWidth={2.2} aria-hidden="true" />
        <span className="text-[13px] font-semibold">
          {t("community.commentCount").replace("{{n}}", String(commentCount))}
        </span>
      </div>
    </div>
  );
}

function FeedErrorState() {
  const { t } = useTranslation("community");
  return (
    <EmptyState
      icon={WifiOff}
      title={t("community.loadError")}
      action={
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`pk-press inline-flex h-11 items-center rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-5 text-sm font-bold text-[var(--color-neutral-900)] transition-colors hover:border-[var(--color-brand-500)] hover:text-[var(--color-brand-600)] ${FOCUS_RING}`}
        >
          Try again
        </button>
      }
    />
  );
}
