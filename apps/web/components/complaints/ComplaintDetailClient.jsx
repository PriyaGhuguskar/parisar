"use client";

// ComplaintDetailClient — CSR detail screen with Realtime + board action row.
//
// Per 04-UI-SPEC.md Screen 3:
//   - Section 1: complaint header card (StatusBadge, kind chip, full description, attribution)
//   - Section 2: photo (if attachment exists) — click → shadcn Dialog lightbox (ESC closes)
//   - Section 3: board action row, conditional on owner_id + auth.uid() + role:
//       Case A — unclaimed + board role → 4 ResponseChip (2×2) + optional free-text → claim
//       Case B — owner is current user → 4 ResponseChip + free-text → add_complaint_response
//       Case C — owned by another board member → Lock + "Owned by ..." banner
//       Member (non-board) → section not rendered (UI-SPEC D4)
//   - Section 4: response trail (ResponseTrailItem, ordered created_at asc), Realtime appended
//
// Race-lost: claimComplaintAction returns { claimed: false } → inline banner.

import { subscribeToComplaintResponses } from "@parisar/api-client";
import { format } from "date-fns";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { addComplaintResponseAction, claimComplaintAction } from "../../app/actions/complaints";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/dialog";
import { ResponseChip } from "./ResponseChip";
import { ResponseTrailItem } from "./ResponseTrailItem";
import { StatusBadge } from "./StatusBadge";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);
const MAX_FREE_TEXT = 500;

function formatFlat(flatJoin) {
  if (!flatJoin) return "—";
  const wing = flatJoin?.wing?.name ?? "";
  const num = flatJoin?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
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
 *   complaint: object,
 *   initialResponses: Array,
 *   signedPhotoUrl: string|null,
 *   userId: string,
 *   role: string,
 * }} props
 */
export function ComplaintDetailClient({
  complaint: initialComplaint,
  initialResponses,
  signedPhotoUrl,
  userId,
  role,
}) {
  const { t } = useTranslation("complaints");
  const [complaint, setComplaint] = useState(initialComplaint);
  const [responses, setResponses] = useState(initialResponses ?? []);
  const [pendingKind, setPendingKind] = useState(null);
  const [freeText, setFreeText] = useState("");
  const [claimLost, setClaimLost] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [animatedResponseIds, setAnimatedResponseIds] = useState(new Set());

  const cleanupRef = useRef(null);

  const isBoard = BOARD_ROLES.has(role);

  // Realtime — append new responses as they arrive.
  useEffect(() => {
    const complaintId = complaint?.id;
    if (!complaintId) return undefined;
    const supabase = createSupabaseBrowserClient();
    cleanupRef.current = subscribeToComplaintResponses(supabase, complaintId, (row) => {
      setResponses((prev) => {
        if (prev.some((r) => r.id === row.id)) return prev;
        return [...prev, row];
      });
      setAnimatedResponseIds((prev) => {
        const next = new Set(prev);
        next.add(row.id);
        return next;
      });
      setTimeout(() => {
        setAnimatedResponseIds((prev) => {
          if (!prev.has(row.id)) return prev;
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }, 300);
    });
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [complaint?.id]);

  async function handleChipClick(kind) {
    if (pendingKind) return;
    setActionError(null);
    setClaimLost(null);
    setPendingKind(kind);

    try {
      const ownerId = complaint?.owner_id ?? null;
      const trimmed = freeText.trim();
      const text = trimmed ? trimmed : null;

      if (ownerId == null) {
        // Case A — atomic claim
        const result = await claimComplaintAction(complaint.id, kind, text);
        if (!result.ok) {
          setActionError(t("complaint.submitError"));
        } else if (result.claimed) {
          setComplaint((prev) => ({ ...prev, ...result.complaint }));
          setFreeText("");
          // Realtime will append the response row; avoid double-render here.
        } else {
          // Race lost
          setClaimLost({ name: "Another board member", flat: "—" });
          // Refresh page to pick up the new owner — we don't have a refetch
          // helper, so we trigger a route refresh via location.reload-light.
          // Actually: simpler — surface the new owner via re-fetching the
          // complaint row when the next Realtime UPDATE arrives. For now,
          // mark complaint owner_id as non-null with placeholder so action
          // row shifts to Case C.
          setComplaint((prev) => ({
            ...prev,
            owner_id: "00000000-0000-0000-0000-000000000000",
            owner: { full_name: "Another board member" },
          }));
        }
      } else if (ownerId === userId) {
        // Case B — owner adds another response
        const result = await addComplaintResponseAction(complaint.id, kind, text);
        if (!result.ok) {
          setActionError(t("complaint.submitError"));
        } else {
          setComplaint((prev) => ({ ...prev, status: kind }));
          setFreeText("");
          // Realtime will deliver the response row.
        }
      }
    } catch (err) {
      console.warn("[ComplaintDetail] action failed:", err?.message ?? err);
      setActionError(t("complaint.submitError"));
    } finally {
      setPendingKind(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------
  const status = complaint.status;
  const ownerId = complaint.owner_id;
  const reporterName = complaint?.reporter?.full_name ?? "—";
  const reporterFlat = formatFlat(complaint?.reporter_flat);
  const filedAt = safeAt(complaint?.created_at);
  const filedByLine = t("complaint.filedByAt", {
    name: reporterName,
    flat: reporterFlat,
    time: filedAt,
  });

  const kindLabel =
    complaint.kind === "society" ? t("complaint.typeSociety") : t("complaint.typeMember");

  let actionCase = "none"; // 'a' | 'b' | 'c' | 'none'
  if (isBoard) {
    if (ownerId == null) actionCase = "a";
    else if (ownerId === userId) actionCase = "b";
    else actionCase = "c";
  }

  const ownerName = complaint?.owner?.full_name ?? "—";
  const ownerFlat = "—"; // owner's flat not joined on the detail query (matches mobile)

  const counterColor =
    freeText.length >= MAX_FREE_TEXT ? "#c81e1e" : freeText.length >= 450 ? "#f59e0b" : "#6e6e6e";

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-4 h-14 flex items-center gap-3">
        <Link
          href="/complaints"
          className="text-sm text-[#0E5A48] hover:underline"
          aria-label="Back to complaints"
        >
          ← Back
        </Link>
        <h1 className="text-xl font-semibold text-[#171717] truncate">
          {t("complaint.detailTitle")}
        </h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* Section 1 — header card */}
        <section className="bg-white rounded-xl p-6 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={status} />
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-100 text-[#525252] text-sm ml-auto">
              {kindLabel}
            </span>
          </div>

          <p
            className="text-base text-[#171717] whitespace-pre-wrap break-words"
            style={{ lineHeight: 1.5 }}
          >
            {complaint.description}
          </p>

          <p className="text-sm text-[#525252]">{filedByLine}</p>
        </section>

        {/* Section 2 — photo */}
        {signedPhotoUrl ? (
          <section className="bg-white rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              aria-label="Open complaint photo full size"
              className="block w-full"
              style={{ aspectRatio: "4 / 3" }}
            >
              {/* biome-ignore lint/performance/noImgElement: signed Supabase URLs not compatible with next/image */}
              <img
                src={signedPhotoUrl}
                alt="Complaint attachment"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
            <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
              <DialogContent className="max-w-3xl p-0 bg-black">
                <DialogTitle className="sr-only">Complaint photo</DialogTitle>
                {/* biome-ignore lint/performance/noImgElement: signed Supabase URLs not compatible with next/image */}
                <img
                  src={signedPhotoUrl}
                  alt="Complaint attachment full size"
                  className="w-full h-auto"
                />
                <DialogClose className="sr-only">Close</DialogClose>
              </DialogContent>
            </Dialog>
          </section>
        ) : null}

        {/* Section 3 — board action row */}
        {actionCase === "a" || actionCase === "b" ? (
          <section className="bg-white rounded-xl p-6 flex flex-col gap-3">
            <h2 className="text-xl font-semibold text-[#171717]">
              {actionCase === "a"
                ? t("complaint.respondHeading")
                : t("complaint.addResponseHeading")}
            </h2>
            <p className="text-sm text-[#525252]">
              {actionCase === "a" ? t("complaint.claimExplainer") : t("complaint.ownerLabel")}
            </p>

            {/* 2×2 grid of chips */}
            <div className="grid grid-cols-2 gap-2">
              <ResponseChip
                responseKind="checking"
                onClick={() => handleChipClick("checking")}
                loading={pendingKind === "checking"}
                disabled={!!pendingKind && pendingKind !== "checking"}
              />
              <ResponseChip
                responseKind="will_resolve"
                onClick={() => handleChipClick("will_resolve")}
                loading={pendingKind === "will_resolve"}
                disabled={!!pendingKind && pendingKind !== "will_resolve"}
              />
              <ResponseChip
                responseKind="need_info"
                onClick={() => handleChipClick("need_info")}
                loading={pendingKind === "need_info"}
                disabled={!!pendingKind && pendingKind !== "need_info"}
              />
              <ResponseChip
                responseKind="resolved"
                onClick={() => handleChipClick("resolved")}
                loading={pendingKind === "resolved"}
                disabled={!!pendingKind && pendingKind !== "resolved"}
              />
            </div>

            {/* Free-text */}
            <div className="flex flex-col gap-1 mt-2">
              <label htmlFor="complaint-free-text" className="text-sm text-[#525252]">
                {t("complaint.freeTextLabel")}
              </label>
              <textarea
                id="complaint-free-text"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder={t("complaint.freeTextPlaceholder")}
                maxLength={MAX_FREE_TEXT}
                rows={3}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#12715A]"
                style={{ minHeight: 80 }}
              />
              <p className="text-sm self-end" style={{ color: counterColor }} aria-live="polite">
                {freeText.length}/{MAX_FREE_TEXT}
              </p>
            </div>

            {actionError ? (
              <p role="alert" className="text-sm text-[#c81e1e]">
                {actionError}
              </p>
            ) : null}
            {claimLost ? (
              <div role="alert" className="rounded-xl border border-[#12715A] bg-[#f5f7ff] p-4">
                <p className="text-sm text-[#171717]">
                  {t("complaint.claimLost", { name: claimLost.name, flat: claimLost.flat })}
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {actionCase === "c" ? (
          <section className="rounded-xl border border-neutral-200 bg-neutral-100 p-4 flex gap-3 items-start">
            <Lock size={20} color="#6e6e6e" aria-hidden="true" />
            <p className="flex-1 text-base text-[#525252]">
              {t("complaint.ownedByBanner", { name: ownerName, flat: ownerFlat })}
            </p>
          </section>
        ) : null}

        {/* Section 4 — response trail */}
        <section className="bg-white rounded-xl p-6 flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-[#171717] mb-2">
            {t("complaint.trailHeading")}
          </h2>
          {responses.length === 0 ? (
            <div className="bg-neutral-100 rounded-xl p-4">
              <p className="text-sm text-[#6e6e6e]">{t("complaint.trailEmpty")}</p>
            </div>
          ) : (
            responses.map((r, idx) => (
              <div key={r.id} className={animatedResponseIds.has(r.id) ? "animate-slide-down" : ""}>
                <ResponseTrailItem response={r} isLast={idx === responses.length - 1} />
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
