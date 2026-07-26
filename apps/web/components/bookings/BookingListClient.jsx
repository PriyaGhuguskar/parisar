"use client";

// BookingListClient — CSR booking list/queue (web). UI-SPEC Screen 6.
//
// Two modes, one component:
//   - Member (BOOK-07): read-only My Bookings — status, awaiting line, rejection
//     reason. A "Request Booking" header button → /bookings/new.
//   - Board (BOOK-02): society queue with Pending/All tabs. Pending cards get an
//     Approve (brand.500) + Reject (danger.500 outlined) action row.
//
// Atomic first-approval (BOOK-03/05) via approveBookingAction — NO optimistic UI:
//   won                        → card flips Approved + ApproverBanner + toast
//   race_lost_or_not_pending   → brand.50 raceLost banner; Realtime flips read-only
//   slot_taken                 → danger slotTaken banner; card STAYS pending (DD-13)
//
// Reject (BOOK-04): shadcn Dialog with an optional reason → rejectBookingAction.
//
// Realtime (BOOK-03 board feel): subscribeToBookings UPDATE merges the row so a
// losing board member's card flips read-only live with the winner's banner.
//
// NO payment surface anywhere (PROJECT no-payments constraint).

import { subscribeToBookings } from "@parisar/api-client";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, Loader2, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { approveBookingAction, rejectBookingAction } from "../../app/actions/bookings";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { OwnerChip } from "../complaints/OwnerChip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);
const MAX_REASON = 300;

// Booking-status badge token map (UI-SPEC Booking Status Badge Colors).
// pending = amber (DD-6, NOT neutral).
const STATUS_STYLES = {
  pending: "bg-[#fffbeb] text-[#b45309] border border-[#f59e0b]",
  approved: "bg-[#ecfdf5] text-[#047857] border border-[#047857]",
  rejected: "bg-[#fef2f2] text-[#c81e1e] border border-[#c81e1e]",
};
const STATUS_ACCENT = {
  pending: "#f59e0b",
  approved: "#047857",
  rejected: "#c81e1e",
};
// PAR-001: STATUS_LABEL is built inside BookingStatusBadge (labels call t()).

function formatFlat(flatJoin) {
  if (!flatJoin) return "—";
  const wing = flatJoin?.wing?.name ?? "";
  const num = flatJoin?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

// time_range is a tstzrange string like ["2026-06-18T18:00:00+00","2026-06-18T20:00:00+00")
function parseRange(timeRange) {
  if (!timeRange || typeof timeRange !== "string") return { start: null, end: null };
  const m = timeRange.match(/[[(]"?([^",]+)"?,"?([^"),]+)"?[)\]]/);
  if (!m) return { start: null, end: null };
  return { start: m[1], end: m[2] };
}

function safeTime(iso) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "HH:mm");
  } catch {
    return "";
  }
}

function dayPill(iso) {
  if (!iso) return { day: "--", month: "" };
  try {
    const d = new Date(iso);
    return { day: format(d, "dd"), month: format(d, "MMM").toUpperCase() };
  } catch {
    return { day: "--", month: "" };
  }
}

/**
 * @param {{
 *   initialBookings: Array,
 *   societyId: string,
 *   role: string,
 *   loadError?: string|null,
 * }} props
 */
export function BookingListClient({ initialBookings, societyId, role, loadError = null }) {
  const { t } = useTranslation("bookings");
  const isBoard = BOARD_ROLES.has(role);

  const [bookings, setBookings] = useState(initialBookings ?? []);
  const [activeTab, setActiveTab] = useState("pending"); // board only: 'pending' | 'all'
  // Per-booking action state.
  const [pendingId, setPendingId] = useState(null);
  const [banners, setBanners] = useState({}); // bookingId -> { kind: 'raceLost'|'slotTaken', text }
  const [toast, setToast] = useState(null);
  // Reject dialog.
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!societyId) return undefined;
    const supabase = createSupabaseBrowserClient();
    cleanupRef.current = subscribeToBookings(supabase, societyId, {
      onInsert: (row) => {
        setBookings((prev) => {
          if (prev.some((b) => b.id === row.id)) return prev;
          return [row, ...prev];
        });
      },
      onUpdate: (row) => {
        // Merge the decided row so a losing board member's card flips read-only
        // with the winner's status/approver live.
        setBookings((prev) => prev.map((b) => (b.id === row.id ? { ...b, ...row } : b)));
      },
    });
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [societyId]);

  const visible = useMemo(() => {
    if (!isBoard) return bookings;
    if (activeTab === "pending") return bookings.filter((b) => b.status === "pending");
    return bookings;
  }, [bookings, isBoard, activeTab]);

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(null), 2000);
  }

  async function handleApprove(booking) {
    if (pendingId) return;
    setBanners((prev) => ({ ...prev, [booking.id]: null }));
    setPendingId(booking.id);
    try {
      const result = await approveBookingAction(booking.id);
      if (!result.ok) {
        setBanners((prev) => ({
          ...prev,
          [booking.id]: { kind: "error", text: t("booking.submitError") },
        }));
        return;
      }
      if (result.approved) {
        setBookings((prev) =>
          prev.map((b) =>
            b.id === booking.id ? { ...b, ...(result.booking ?? {}), status: "approved" } : b,
          ),
        );
        showToast(t("booking.approveSuccess"));
      } else if (result.reason === "slot_taken") {
        // Card stays pending — board may still Reject (DD-13).
        setBanners((prev) => ({
          ...prev,
          [booking.id]: { kind: "slotTaken", text: t("booking.slotTaken") },
        }));
      } else {
        // race_lost_or_not_pending — show banner; Realtime UPDATE flips read-only.
        setBanners((prev) => ({
          ...prev,
          [booking.id]: { kind: "raceLost", text: t("booking.raceLost") },
        }));
      }
    } catch {
      setBanners((prev) => ({
        ...prev,
        [booking.id]: { kind: "error", text: t("booking.submitError") },
      }));
    } finally {
      setPendingId(null);
    }
  }

  async function handleRejectConfirm() {
    if (!rejectTarget || rejecting) return;
    setRejecting(true);
    try {
      const result = await rejectBookingAction(rejectTarget.id, rejectReason.trim() || null);
      if (result.ok) {
        setBookings((prev) =>
          prev.map((b) =>
            b.id === rejectTarget.id
              ? { ...b, status: "rejected", rejection_reason: rejectReason.trim() || null }
              : b,
          ),
        );
        showToast(t("booking.rejectSuccess"));
        setRejectTarget(null);
        setRejectReason("");
      } else {
        // PAR-104: a failed reject used to silently no-op (the dialog just closed
        // its spinner and nothing happened). Surface it and keep the dialog open
        // so the board member can retry.
        showToast(t("booking.submitError"));
      }
    } catch {
      showToast(t("booking.submitError"));
    } finally {
      setRejecting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <header className="bg-white border-b border-neutral-200 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="text-sm text-[#0E5A48] hover:underline"
            aria-label="Back to dashboard"
          >
            ← Dashboard
          </Link>
          <h1 className="text-xl font-semibold text-[#171717] truncate">
            {isBoard ? t("booking.queueTitle") : t("booking.myTitle")}
          </h1>
        </div>
        {!isBoard ? (
          <Link
            href="/bookings/new"
            className="inline-flex items-center justify-center h-9 px-3 rounded-lg bg-[#0E5A48] text-white text-sm font-semibold hover:bg-[#0A4436] transition-colors"
          >
            {t("booking.requestCta")}
          </Link>
        ) : null}
      </header>

      {isBoard ? (
        <div className="bg-white border-b border-neutral-100 px-4">
          <div className="flex gap-6 max-w-3xl mx-auto">
            <TabButton
              label="Pending"
              active={activeTab === "pending"}
              onClick={() => setActiveTab("pending")}
            />
            <TabButton
              label="All"
              active={activeTab === "all"}
              onClick={() => setActiveTab("all")}
            />
          </div>
        </div>
      ) : null}

      <main className="max-w-3xl mx-auto px-4 py-6">
        {loadError ? (
          <ErrorState />
        ) : visible.length === 0 ? (
          <EmptyState isBoard={isBoard} />
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                isBoard={isBoard}
                banner={banners[b.id]}
                actionPending={pendingId === b.id}
                anyPending={!!pendingId}
                onApprove={() => handleApprove(b)}
                onReject={() => {
                  setRejectTarget(b);
                  setRejectReason("");
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Reject dialog (BOOK-04) — the reason sheet IS the confirmation (DD-8). */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("booking.rejectHeading")}</DialogTitle>
          </DialogHeader>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t("booking.reasonPlaceholder")}
            maxLength={MAX_REASON}
            rows={3}
            aria-label={t("booking.reasonPlaceholder")}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#12715A]"
            style={{ minHeight: 80 }}
          />
          <DialogFooter>
            <DialogClose className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-neutral-200 text-sm font-semibold text-[#171717] hover:bg-neutral-50">
              Cancel
            </DialogClose>
            <button
              type="button"
              onClick={handleRejectConfirm}
              disabled={rejecting}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-[#c81e1e] text-white text-sm font-semibold hover:bg-[#dc2626] disabled:opacity-60"
            >
              {rejecting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                t("booking.rejectConfirm")
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast ? (
        <output
          aria-live="polite"
          className="fixed top-4 left-4 right-4 mx-auto max-w-md inline-flex items-center gap-2 rounded-xl border border-[#047857] bg-[#ecfdf5] text-[#171717] px-4 py-3 shadow-lg z-50"
        >
          <CheckCircle2 size={16} color="#047857" aria-hidden="true" />
          <span className="text-sm">{toast}</span>
        </output>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BookingCard (left stripe + 56×56 date pill + status badge + action row)
// ---------------------------------------------------------------------------

function BookingCard({ booking, isBoard, banner, actionPending, anyPending, onApprove, onReject }) {
  const { t } = useTranslation("bookings");
  const status = booking?.status ?? "pending";
  const accent = STATUS_ACCENT[status] ?? STATUS_ACCENT.pending;
  const { start, end } = parseRange(booking?.time_range);
  const pill = dayPill(start);
  const amenityName = booking?.amenity?.name ?? "—";

  const requesterName = booking?.requester?.full_name ?? "—";
  const requesterFlat = formatFlat(booking?.requester_flat);
  const requestedBy = t("booking.requestedBy")
    .replace("{{name}}", requesterName)
    .replace("{{flat}}", requesterFlat);

  const approverFlat = formatFlat(booking?.approver_flat);
  const rejecterFlat = formatFlat(booking?.rejecter_flat);

  return (
    <div className="flex bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
      <div aria-hidden="true" style={{ width: 4, backgroundColor: accent, flexShrink: 0 }} />

      <div className="flex-1 p-4 flex flex-col gap-2 min-w-0">
        <div className="flex items-start gap-3">
          {/* 56×56 date pill */}
          <div
            className="shrink-0 rounded-xl bg-[#f5f7ff] flex flex-col items-center justify-center"
            style={{ width: 56, height: 56 }}
          >
            <span className="text-xl font-semibold text-[#0E5A48] leading-none">{pill.day}</span>
            <span className="text-sm text-[#0E5A48]">{pill.month}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <h2 className="text-xl font-semibold text-[#171717] break-words flex-1 min-w-0">
                {amenityName}
              </h2>
              <BookingStatusBadge status={status} />
            </div>
            {start && end ? (
              <p className="text-sm text-[#525252]">
                {safeTime(start)}–{safeTime(end)}
              </p>
            ) : null}
            {booking?.purpose ? (
              <p className="text-base text-[#171717] line-clamp-1 break-words">{booking.purpose}</p>
            ) : null}
          </div>
        </div>

        {isBoard ? (
          <OwnerChip ownerName={requesterName} ownerFlat={requesterFlat} labelText={requestedBy} />
        ) : null}

        {/* ApproverBanner */}
        {status === "approved" && booking?.approver_flat ? (
          <ApproverBanner kind="approved" flat={approverFlat} />
        ) : null}
        {status === "rejected" && booking?.rejecter_flat ? (
          <ApproverBanner kind="rejected" flat={rejecterFlat} />
        ) : null}

        {/* Member: awaiting line / rejection reason */}
        {!isBoard && status === "pending" ? (
          <p className="text-sm text-[#6e6e6e]">{t("booking.awaitingMember")}</p>
        ) : null}
        {!isBoard && status === "rejected" && booking?.rejection_reason ? (
          <p className="text-base text-[#171717] break-words">{booking.rejection_reason}</p>
        ) : null}

        {/* Approve race / slot-taken banners */}
        {banner?.kind === "raceLost" ? (
          <div role="alert" className="rounded-xl border border-[#12715A] bg-[#f5f7ff] p-3">
            <p className="text-sm text-[#171717]">{banner.text}</p>
          </div>
        ) : null}
        {banner?.kind === "slotTaken" ? (
          <div
            role="alert"
            className="rounded-xl border border-[#c81e1e] bg-[#fef2f2] p-3 flex gap-2"
          >
            <AlertTriangle size={20} color="#c81e1e" aria-hidden="true" />
            <p className="text-sm text-[#171717]">{banner.text}</p>
          </div>
        ) : null}
        {banner?.kind === "error" ? (
          <p role="alert" className="text-sm text-[#c81e1e]">
            {banner.text}
          </p>
        ) : null}

        {/* Board action row — pending cards only, and not when race-lost. */}
        {isBoard && status === "pending" && banner?.kind !== "raceLost" ? (
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={onApprove}
              disabled={anyPending}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-[#0E5A48] text-white text-sm font-semibold hover:bg-[#0A4436] disabled:opacity-60"
            >
              {actionPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                t("booking.approveCta")
              )}
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={anyPending}
              className="inline-flex items-center justify-center h-10 px-4 rounded-lg border-[1.5px] border-[#c81e1e] text-[#c81e1e] text-sm font-semibold bg-white hover:bg-[#fef2f2] disabled:opacity-60"
            >
              {t("booking.rejectCta")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BookingStatusBadge({ status }) {
  // PAR-001 fix: this sub-component needs its own t(); STATUS_LABEL is built here.
  const { t } = useTranslation("bookings");
  const STATUS_LABEL = {
    pending: t("booking.statusPending"),
    approved: t("booking.statusApproved"),
    rejected: t("booking.statusRejected"),
  };
  const classes = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm whitespace-nowrap shrink-0 ${classes}`}
      title={`Status: ${label}`}
    >
      {label}
    </span>
  );
}

function ApproverBanner({ kind, name, flat }) {
  const { t } = useTranslation("bookings");
  // listBookings joins approver/rejecter FLAT but not their name, so attribution
  // shows the flat with a generic "A board member" name. When a future query joins
  // the approver name, it flows through unchanged.
  const tpl = kind === "approved" ? t("booking.approvedBy") : t("booking.rejectedBy");
  const text = tpl.replace("{{name}}", name ?? "A board member").replace("{{flat}}", flat);
  const tint = kind === "approved" ? "bg-[#ecfdf5] text-[#047857]" : "bg-[#fef2f2] text-[#c81e1e]";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm self-start ${tint}`}
    >
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tabs / empty / error
// ---------------------------------------------------------------------------

function TabButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`py-3 text-sm transition-colors ${
        active
          ? "font-semibold text-[#0E5A48] border-b-2 border-[#12715A]"
          : "text-[#6e6e6e] border-b-2 border-transparent hover:text-[#525252]"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({ isBoard }) {
  const { t } = useTranslation("bookings");
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-8 text-center">
      <h2 className="font-semibold text-[#525252]" style={{ fontSize: 28, lineHeight: 1.15 }}>
        {t("booking.emptyHeading")}
      </h2>
      <p className="text-base text-[#6e6e6e]">
        {isBoard ? t("booking.emptyBodyBoard") : t("booking.emptyBody")}
      </p>
      {!isBoard ? (
        <Link
          href="/bookings/new"
          className="inline-flex items-center justify-center h-12 px-6 rounded-xl bg-[#0E5A48] hover:bg-[#0A4436] text-white text-base font-semibold transition-colors mt-2"
        >
          {t("booking.requestCta")}
        </Link>
      ) : null}
    </div>
  );
}

function ErrorState() {
  const { t } = useTranslation("bookings");
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-8 text-center bg-white rounded-xl">
      <WifiOff size={48} className="text-[#8a8a8a]" aria-hidden="true" />
      <h2 className="text-xl font-semibold text-[#171717]">{t("booking.loadError")}</h2>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-neutral-200 text-sm font-semibold text-[#171717] hover:bg-neutral-50 transition-colors mt-2"
      >
        Try again
      </button>
    </div>
  );
}
