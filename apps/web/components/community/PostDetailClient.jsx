"use client";

// PostDetailClient — full post + reportable text comments (web). UI-SPEC Screen 6.
//
//   Section 1: full post card (PostTypeChip + OwnerChip + full body + PhotoGrid +
//     Report (non-author) / Delete (author)).
//   Section 2: comments (oldest-first CommentItem list; each Report (non-author) /
//     Delete (author)).
//   Section 3: add-comment composer (addCommentAction; no optimistic UI — the
//     comment arrives via Realtime).
//
// Report → ReportReasonSheet → reportContentAction → swap THAT item to a
// HiddenPendingBanner for the reporter only (D-03). Realtime on post_comments.

import { subscribeToPostComments } from "@parisar/api-client";
import { format, formatDistanceToNow } from "date-fns";
import { Flag, Loader2, MoreVertical, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addCommentAction,
  deleteCommentAction,
  deletePostAction,
} from "../../app/(protected)/community/actions";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { OwnerChip } from "../complaints/OwnerChip";
import { HiddenPendingBanner } from "./HiddenPendingBanner";
import { PhotoGrid } from "./PhotoGrid";
import { PostTypeChip } from "./PostTypeChip";
import { ReportReasonSheet } from "./ReportReasonSheet";

const MAX_COMMENT = 1000;

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
 *   post: object,
 *   initialComments: Array,
 *   photoUrls: string[],
 *   userId: string,
 * }} props
 */
export function PostDetailClient({ post, initialComments, photoUrls = [], userId }) {
  const { t } = useTranslation("community");
  const [comments, setComments] = useState(initialComments ?? []);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [commentError, setCommentError] = useState(null);
  const [animatedIds, setAnimatedIds] = useState(new Set());
  const [reportTarget, setReportTarget] = useState(null); // { targetKind, targetId }
  const [reportedIds, setReportedIds] = useState(new Set()); // reporter-only optimistic
  const [postDeleted, setPostDeleted] = useState(false);
  const cleanupRef = useRef(null);

  useEffect(() => {
    const postId = post?.id;
    if (!postId) return undefined;
    const supabase = createSupabaseBrowserClient();
    cleanupRef.current = subscribeToPostComments(supabase, postId, {
      onInsert: (row) => {
        setComments((prev) => {
          if (prev.some((cm) => cm.id === row.id)) return prev;
          return [...prev, row];
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
        setComments((prev) => prev.map((cm) => (cm.id === row.id ? { ...cm, ...row } : cm)));
      },
    });
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [post?.id]);

  const authorName = post?.author?.full_name ?? "—";
  const authorFlat = flatLabel(post?.author_flat);
  const postedByAt = t("community.postedByAt")
    .replace("{{name}}", authorName)
    .replace("{{flat}}", authorFlat)
    .replace("{{time}}", safeAt(post?.created_at));
  const isPostAuthor = post?.author_id === userId;

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed || sending) return;
    setCommentError(null);
    setSending(true);
    try {
      const res = await addCommentAction({ postId: post.id, body: trimmed });
      if (!res.ok) {
        setCommentError(t("community.commentError"));
        return;
      }
      setCommentText("");
      // No optimistic UI — Realtime delivers the new comment row.
    } catch {
      setCommentError(t("community.commentError"));
    } finally {
      setSending(false);
    }
  }

  function handleReported() {
    if (reportTarget?.targetId) {
      setReportedIds((prev) => new Set(prev).add(reportTarget.targetId));
    }
  }

  // PAR-103: both deletes were fire-and-forget — a failure left the post/comment
  // on screen with zero feedback. Surface it (reusing the on-page error slot) so
  // the user knows the delete did not apply and can retry.
  async function handleDeletePost() {
    if (!window.confirm(t("community.deleteConfirm"))) return;
    setCommentError(null);
    try {
      const res = await deletePostAction(post.id);
      if (res.ok) {
        setPostDeleted(true);
      } else {
        setCommentError(t("community.deleteError"));
      }
    } catch {
      setCommentError(t("community.deleteError"));
    }
  }

  async function handleDeleteComment(commentId) {
    if (!window.confirm(t("community.deleteCommentConfirm"))) return;
    setCommentError(null);
    try {
      const res = await deleteCommentAction(commentId, post.id);
      if (res.ok) {
        setComments((prev) => prev.filter((cm) => cm.id !== commentId));
      } else {
        setCommentError(t("community.deleteError"));
      }
    } catch {
      setCommentError(t("community.deleteError"));
    }
  }

  if (postDeleted) {
    return (
      <div className="min-h-screen bg-[var(--color-neutral-50)] flex flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-base text-[#525252]">This post has been deleted.</p>
        <Link
          href="/community"
          className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-neutral-200 text-sm font-semibold text-[#171717] hover:bg-neutral-50 transition-colors"
        >
          Back to Community
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <header className="bg-white border-b border-neutral-200 px-4 h-14 flex items-center gap-3">
        <Link
          href="/community"
          className="text-sm text-[#0E5A48] hover:underline"
          aria-label="Back to community"
        >
          ← Back
        </Link>
        <h1 className="text-xl font-semibold text-[#171717] truncate">
          {t("community.detailTitle")}
        </h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* Section 1 — full post */}
        <section className="bg-white rounded-xl p-6 flex flex-col gap-3">
          <div className="flex items-start gap-2 flex-wrap">
            <PostTypeChip kind={post?.kind} />
            <span className="text-sm text-[#6e6e6e] ml-auto shrink-0">
              {safeAge(post?.created_at)}
            </span>
            {isPostAuthor ? (
              <button
                type="button"
                aria-label="Delete post"
                onClick={handleDeletePost}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#6e6e6e] hover:text-[#c81e1e] hover:bg-neutral-100"
              >
                <MoreVertical size={16} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                aria-label={t("community.reportConfirm")}
                onClick={() => setReportTarget({ targetKind: "post", targetId: post.id })}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#6e6e6e] hover:text-[#c81e1e] hover:bg-neutral-100"
              >
                <Flag size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          <OwnerChip ownerName={authorName} ownerFlat={authorFlat} labelText={postedByAt} />

          <p
            className="text-base text-[#171717] whitespace-pre-wrap break-words"
            style={{ lineHeight: 1.5 }}
          >
            {post?.body ?? ""}
          </p>

          <PhotoGrid photos={photoUrls} />
        </section>

        {/* Section 2 — comments */}
        <section className="bg-white rounded-xl p-6 flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-[#171717] mb-2">
            {t("community.commentsHeading")}
          </h2>
          {comments.length === 0 ? (
            <p className="text-sm text-[#6e6e6e]">{t("community.commentsEmpty")}</p>
          ) : (
            comments.map((cm) =>
              reportedIds.has(cm.id) ? (
                <HiddenPendingBanner key={cm.id} />
              ) : (
                <div key={cm.id} className={animatedIds.has(cm.id) ? "animate-slide-down" : ""}>
                  <CommentItem
                    comment={cm}
                    isAuthor={cm.author_id === userId}
                    onReport={() => setReportTarget({ targetKind: "comment", targetId: cm.id })}
                    onDelete={() => handleDeleteComment(cm.id)}
                  />
                </div>
              ),
            )
          )}
        </section>

        {/* Section 3 — comment composer */}
        <section className="bg-white rounded-xl p-4">
          <form onSubmit={handleSend} className="flex items-end gap-2">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t("community.commentPlaceholder")}
              maxLength={MAX_COMMENT}
              rows={1}
              aria-label={t("community.commentPlaceholder")}
              className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#12715A]"
              style={{ minHeight: 44 }}
            />
            <button
              type="submit"
              disabled={!commentText.trim() || sending}
              aria-label={t("community.commentSend")}
              className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-[#0E5A48] text-white hover:bg-[#0A4436] disabled:bg-neutral-200 disabled:text-[#6e6e6e]"
            >
              {sending ? (
                <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={18} aria-hidden="true" />
              )}
            </button>
          </form>
          {commentError ? (
            <p role="alert" className="text-sm text-[#c81e1e] mt-1">
              {commentError}
            </p>
          ) : null}
        </section>
      </main>

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
// CommentItem — mirrors ResponseTrailItem token (attributed text entry)
// ---------------------------------------------------------------------------

function CommentItem({ comment, isAuthor, onReport, onDelete }) {
  const { t } = useTranslation("community");
  const authorName = comment?.author?.full_name ?? "—";
  const authorFlat = flatLabel(comment?.author_flat);
  const byLine = t("community.commentBy")
    .replace("{{name}}", authorName)
    .replace("{{flat}}", authorFlat)
    .replace("{{age}}", safeAge(comment?.created_at));

  return (
    <div className="flex flex-col gap-1 rounded-xl bg-neutral-50 p-4">
      <div className="flex items-start gap-2">
        <span className="text-sm text-[#525252] flex-1">{byLine}</span>
        {isAuthor ? (
          <button
            type="button"
            aria-label="Delete comment"
            onClick={onDelete}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[#6e6e6e] hover:text-[#c81e1e] hover:bg-neutral-100"
          >
            <MoreVertical size={14} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t("community.reportConfirm")}
            onClick={onReport}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[#6e6e6e] hover:text-[#c81e1e] hover:bg-neutral-100"
          >
            <Flag size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="text-base text-[#171717] whitespace-pre-wrap break-words">
        {comment?.body ?? ""}
      </p>
    </div>
  );
}
