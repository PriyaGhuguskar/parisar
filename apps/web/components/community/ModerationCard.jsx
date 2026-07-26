"use client";

// ModerationCard — one reported+hidden item in the moderation queue (web). UI-SPEC
// Screen 8. THE ONE PLACE hidden content is rendered (admin-only — D-03 / DD2).
//
// Action row: Restore (brand outlined, inline reveal→confirm → restoreContent)
// + Confirm takedown (danger fill, inline "can't be undone" confirm →
// confirmTakedown). The inline confirm IS the gate (no separate dialog — DD11).
//
// PRESENTATION — this card must out-rank everything around it, because an unactioned
// report is a 24h obligation (COMM-06). It gets:
//   · a warning-toned left edge and header strip, so a queue of them reads as a
//     stack of open obligations rather than a list of posts,
//   · the report state as a kit StatusPill ("N reports") — the same chip vocabulary
//     used for complaint status everywhere else,
//   · the two outcomes rendered as unmistakably different weights: Restore is a
//     calm brand outline, Confirm takedown is a filled danger button. Neither is
//     ever a bare text link, because both are irreversible-ish moderation acts.

import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  confirmTakedownAction,
  restoreContentAction,
} from "../../app/(protected)/community/actions";
import { OwnerChip } from "../complaints/OwnerChip";
import { StatusPill } from "../kit";
import { PhotoGrid } from "./PhotoGrid";

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

/**
 * @param {{
 *   item: object,                 // { id, targetKind:'post'|'comment', body, author, author_flat, hidden_at, reportCount, reasons, photoUrls? }
 *   onResolved?: (id: string) => void,
 * }} props
 */
export function ModerationCard({ item, onResolved }) {
  const { t } = useTranslation(["community", "moderation"]);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(null); // 'restore' | 'takedown' | null
  const [error, setError] = useState(null);

  const targetKind = item?.targetKind ?? "post";
  const kindLabel =
    targetKind === "comment"
      ? t("moderation:moderation.kindComment")
      : t("moderation:moderation.kindPost");
  const authorName = item?.author?.full_name ?? "—";
  const authorFlat = flatLabel(item?.author_flat);
  const postedBy = t("community:community.postedBy")
    .replace("{{name}}", authorName)
    .replace("{{flat}}", authorFlat);
  const reportCount = item?.reportCount ?? 1;
  const reasons = item?.reasons?.length ? item.reasons.join(", ") : "";

  async function doRestore() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await restoreContentAction({ targetKind, targetId: item.id });
      if (!res.ok) {
        setError(t("moderation:moderation.restoreError"));
        return;
      }
      onResolved?.(item.id);
    } catch {
      setError(t("moderation:moderation.restoreError"));
    } finally {
      setBusy(false);
    }
  }

  async function doTakedown() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await confirmTakedownAction({ targetKind, targetId: item.id });
      if (!res.ok) {
        setError(t("moderation:moderation.takedownError"));
        return;
      }
      onResolved?.(item.id);
    } catch {
      setError(t("moderation:moderation.takedownError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="overflow-hidden rounded-[18px] border bg-[var(--color-neutral-0)]"
      style={{
        borderColor: "var(--color-warning)",
        borderLeftWidth: 4,
        boxShadow: "0 4px 12px -4px rgba(18,38,28,.12), 0 2px 4px rgba(18,38,28,.05)",
      }}
    >
      {/* Header strip — kind, report state, and how long this has been waiting. */}
      <div
        className="flex flex-wrap items-center gap-2 border-b px-5 py-3"
        style={{ backgroundColor: "#FDF0DF", borderColor: "var(--color-neutral-200)" }}
      >
        <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-[#8A4708]">
          {kindLabel}
        </span>
        <StatusPill tone="danger">
          {t("moderation:moderation.reportCount").replace("{{n}}", String(reportCount))}
        </StatusPill>
        <span className="ml-auto text-[13px] font-semibold text-[#8A4708]">
          {safeAge(item?.hidden_at)}
        </span>
      </div>

      <div className="flex flex-col gap-3 p-5">
        {/* The reported (hidden) content — the one place it renders (admin-only). */}
        <p className="line-clamp-4 break-words text-[15px] leading-relaxed text-[var(--color-neutral-900)]">
          {item?.body ?? ""}
        </p>

        {targetKind === "post" && item?.photoUrls?.length ? (
          <PhotoGrid photos={item.photoUrls} />
        ) : null}

        <OwnerChip ownerName={authorName} ownerFlat={authorFlat} labelText={postedBy} />

        {reasons ? (
          <p className="text-[13px] leading-relaxed text-[var(--color-neutral-400)]">
            {t("moderation:moderation.reportedFor").replace("{{reasons}}", reasons)}
          </p>
        ) : null}

        {/* Action row — inline confirm IS the gate (DD11). */}
        {armed === "restore" ? (
          <div className="pk-in flex flex-col gap-3 rounded-[14px] border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] p-4">
            <p className="text-sm font-semibold text-[var(--color-neutral-900)]">
              {t("moderation:moderation.restoreConfirm")}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={doRestore}
                disabled={busy}
                aria-label="Restore content"
                className={`pk-press inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 bg-[var(--color-neutral-0)] px-5 text-sm font-bold transition-colors disabled:opacity-50 ${FOCUS_RING}`}
                style={{
                  borderColor: "var(--color-brand-500)",
                  color: "var(--color-brand-700)",
                }}
              >
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                {t("moderation:moderation.restoreCta")}
              </button>
              <button
                type="button"
                onClick={() => setArmed(null)}
                disabled={busy}
                className={`inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-[var(--color-neutral-600)] transition-colors hover:bg-[var(--color-neutral-200)] ${FOCUS_RING}`}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : armed === "takedown" ? (
          <div
            className="pk-in flex flex-col gap-3 rounded-[14px] border p-4"
            style={{ borderColor: "var(--color-danger)", backgroundColor: "#FCE9E6" }}
          >
            <p className="text-sm font-bold" style={{ color: "#94291A" }}>
              {t("moderation:moderation.takedownConfirm")}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={doTakedown}
                disabled={busy}
                aria-label="Confirm permanent takedown"
                className={`pk-press inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white transition-opacity disabled:opacity-50 ${FOCUS_RING}`}
                style={{ backgroundColor: "var(--color-danger)" }}
              >
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                {t("moderation:moderation.takedownCta")}
              </button>
              <button
                type="button"
                onClick={() => setArmed(null)}
                disabled={busy}
                className={`inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors hover:bg-[#FADBD5] ${FOCUS_RING}`}
                style={{ color: "#94291A" }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 border-t border-[var(--color-neutral-200)] pt-4">
            <button
              type="button"
              onClick={() => setArmed("restore")}
              className={`pk-press inline-flex h-11 items-center justify-center rounded-xl border-2 bg-[var(--color-neutral-0)] px-5 text-sm font-bold transition-colors hover:bg-[var(--color-brand-50)] ${FOCUS_RING}`}
              style={{ borderColor: "var(--color-brand-500)", color: "var(--color-brand-700)" }}
            >
              {t("moderation:moderation.restoreCta")}
            </button>
            <button
              type="button"
              onClick={() => setArmed("takedown")}
              className={`pk-press inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-bold text-white transition-opacity hover:opacity-90 ${FOCUS_RING}`}
              style={{ backgroundColor: "var(--color-danger)" }}
            >
              {t("moderation:moderation.takedownCta")}
            </button>
          </div>
        )}

        {error ? (
          <p role="alert" className="text-sm font-semibold" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
