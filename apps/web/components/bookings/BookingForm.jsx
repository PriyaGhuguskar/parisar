"use client";

// BookingForm — amenity-booking request form (web). UI-SPEC Screen 5, DD-5.
//
// Fields:
//   - AmenityPicker: shadcn Select of society amenities (open–close hours hint).
//   - Date: shadcn Calendar inside a Popover — SINGLE date picker (NOT a month
//     availability grid, DD-5). Min today, max +30d.
//   - Time range: two <input type="time"> (start/end). Client validation via the
//     pure validateRange() helper: end>start, ≤4h, ≥1h lead, ≤30d horizon, within
//     amenity open/close hours. (The request_booking RPC re-enforces server-side.)
//   - Purpose: optional Textarea (max 300).
//
// NO optimistic UI (Phase 4 D1) — awaits requestBookingAction, maps RPC error codes
// to inline copy, success → /bookings. Slot conflict is impossible at request time
// (DD-13) so this form never shows slot_taken.

import { format } from "date-fns";
import { CalendarIcon, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { requestBookingAction } from "../../app/actions/bookings";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

const MAX_PURPOSE = 300;
const MAX_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_DURATION_MS = 4 * 60 * 60 * 1000;
const MIN_LEAD_MS = 60 * 60 * 1000;

// Shared field vocabulary — one label size, one control height, one focus ring.
const LABEL_CLS = "text-[13px] font-semibold text-[var(--color-neutral-600)]";
const HINT_CLS = "text-[13px] text-[var(--color-neutral-400)]";
const FOCUS_CLS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2";
const CONTROL_CLS = `rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] px-3 text-[15px] text-[var(--color-neutral-900)] transition-colors focus:outline-none ${FOCUS_CLS} disabled:opacity-50`;

function hoursHint(amenity, t) {
  if (!amenity?.open_time || !amenity?.close_time) return null;
  return t("booking.hoursHint")
    .replace("{{open}}", String(amenity.open_time).slice(0, 5))
    .replace("{{close}}", String(amenity.close_time).slice(0, 5));
}

// "HH:MM:SS" or "HH:MM" → minutes since midnight.
function timeStrToMinutes(t) {
  if (!t) return null;
  const [h, m] = String(t)
    .split(":")
    .map((x) => Number.parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Pure validator for the booking window. Returns { ok, errorCode?, startsAt?, endsAt? }.
 * Exported for unit testing without the date/time controls.
 *
 * @param {{ date: Date|null, start: string, end: string, amenity: object|null, nowMs?: number }} input
 */
export function validateRange({ date, start, end, amenity, nowMs = Date.now() }) {
  if (!date || !start || !end) return { ok: false, errorCode: null };

  const startMin = timeStrToMinutes(start);
  const endMin = timeStrToMinutes(end);
  if (startMin == null || endMin == null) return { ok: false, errorCode: null };

  if (endMin <= startMin) return { ok: false, errorCode: "time_order" };

  const startsAt = new Date(date);
  startsAt.setHours(0, 0, 0, 0);
  startsAt.setMinutes(startMin);
  const endsAt = new Date(date);
  endsAt.setHours(0, 0, 0, 0);
  endsAt.setMinutes(endMin);

  const durationMs = endsAt.getTime() - startsAt.getTime();
  if (durationMs > MAX_DURATION_MS) return { ok: false, errorCode: "duration" };

  const leadMs = startsAt.getTime() - nowMs;
  if (leadMs < MIN_LEAD_MS) return { ok: false, errorCode: "lead_time" };
  if (startsAt.getTime() - nowMs > MAX_HORIZON_MS) return { ok: false, errorCode: "too_far" };

  if (amenity?.open_time && amenity?.close_time) {
    const openMin = timeStrToMinutes(amenity.open_time);
    const closeMin = timeStrToMinutes(amenity.close_time);
    if (openMin != null && closeMin != null && (startMin < openMin || endMin > closeMin)) {
      return { ok: false, errorCode: "hours" };
    }
  }

  return { ok: true, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

/**
 * @param {{ amenities: Array, hasAmenities: boolean }} props
 */
export function BookingForm({ amenities, hasAmenities }) {
  const { t } = useTranslation("bookings");
  // PAR-001 fix: copy uses t(), so this table is built inside the component.
  const ERROR_COPY = {
    time_order: t("booking.timeOrderError"),
    lead_time: t("booking.leadTimeError"),
    too_far: t("booking.durationError"),
    duration: t("booking.durationError"),
    hours: t("booking.hoursError"),
    submit_failed: t("booking.submitError"),
  };
  const router = useRouter();

  const [amenityId, setAmenityId] = useState("");
  const [date, setDate] = useState(null);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const amenity = useMemo(
    () => amenities.find((a) => a.id === amenityId) ?? null,
    [amenities, amenityId],
  );

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const maxDate = useMemo(() => new Date(today.getTime() + MAX_HORIZON_MS), [today]);

  const validation = useMemo(
    () => validateRange({ date, start, end, amenity }),
    [date, start, end, amenity],
  );
  const rangeError =
    !validation.ok && validation.errorCode ? ERROR_COPY[validation.errorCode] : null;

  const canSubmit =
    !!amenityId && !!date && !!start && !!end && validation.ok && !submitting && hasAmenities;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await requestBookingAction({
        amenityId,
        startsAt: validation.startsAt,
        endsAt: validation.endsAt,
        purpose: purpose.trim() ? purpose.trim() : null,
      });
      if (!result.ok) {
        setSubmitError(ERROR_COPY[result.error] ?? t("booking.submitError"));
        return;
      }
      setSuccessOpen(true);
      setTimeout(() => {
        router.push("/bookings");
        router.refresh();
      }, 600);
    } catch {
      setSubmitError(t("booking.submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  const timeHelper =
    amenity?.open_time && amenity?.close_time
      ? t("booking.timeHelper")
          .replace("{{open}}", String(amenity.open_time).slice(0, 5))
          .replace("{{close}}", String(amenity.close_time).slice(0, 5))
      : t("booking.timeHelper").replace("{{open}}", "—").replace("{{close}}", "—");

  return (
    <form onSubmit={handleSubmit} className="pk-stagger flex flex-col gap-5">
      {/* Amenity */}
      <div className="pk-in flex flex-col gap-1.5" style={{ "--d": "40ms" }}>
        <label htmlFor="amenity-select" className={LABEL_CLS}>
          {t("booking.amenityLabel")}
        </label>
        {hasAmenities ? (
          <>
            <Select value={amenityId} onValueChange={setAmenityId}>
              <SelectTrigger id="amenity-select" className="w-full">
                <SelectValue placeholder={t("booking.amenityLabel")} />
              </SelectTrigger>
              <SelectContent>
                {amenities.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {amenity && hoursHint(amenity, t) ? (
              <p className={HINT_CLS}>{hoursHint(amenity, t)}</p>
            ) : null}
          </>
        ) : (
          <p className={HINT_CLS}>{t("booking.noAmenities")}</p>
        )}
      </div>

      {/* Date — shadcn Calendar in a Popover (single date, DD-5) */}
      <div className="pk-in flex flex-col gap-1.5" style={{ "--d": "90ms" }}>
        <label htmlFor="booking-date-trigger" className={LABEL_CLS}>
          {t("booking.dateLabel")}
        </label>
        <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
          <PopoverTrigger
            render={
              <button
                id="booking-date-trigger"
                type="button"
                disabled={!hasAmenities}
                className={`pk-press inline-flex h-11 items-center gap-2 text-left font-medium hover:border-[var(--color-brand-500)] ${CONTROL_CLS}`}
              />
            }
          >
            <CalendarIcon
              size={16}
              strokeWidth={2.2}
              aria-hidden="true"
              style={{ color: "var(--color-brand-600)" }}
            />
            {date ? (
              format(date, "EEE, dd MMM yyyy")
            ) : (
              <span className="font-normal text-[var(--color-neutral-400)]">
                {t("booking.dateLabel")}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date ?? undefined}
              onSelect={(d) => {
                setDate(d ?? null);
                setDatePopoverOpen(false);
              }}
              disabled={{ before: today, after: maxDate }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Time range */}
      <div className="pk-in flex flex-col gap-1.5" style={{ "--d": "140ms" }}>
        <span className={LABEL_CLS}>{t("booking.timeLabel")}</span>
        <div className="flex items-center gap-2">
          <input
            type="time"
            aria-label="Start time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            disabled={!hasAmenities}
            className={`h-11 flex-1 ${CONTROL_CLS}`}
          />
          <span aria-hidden="true" className="text-[var(--color-neutral-400)]">
            →
          </span>
          <input
            type="time"
            aria-label="End time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            disabled={!hasAmenities}
            className={`h-11 flex-1 ${CONTROL_CLS}`}
          />
        </div>
        <p className={HINT_CLS}>{timeHelper}</p>
        {rangeError ? (
          <p
            role="alert"
            className="text-[13px] font-semibold"
            style={{ color: "var(--color-danger)" }}
          >
            {rangeError}
          </p>
        ) : null}
      </div>

      {/* Purpose */}
      <div className="pk-in flex flex-col gap-1.5" style={{ "--d": "190ms" }}>
        <label htmlFor="booking-purpose" className={LABEL_CLS}>
          {t("booking.purposeLabel")}
        </label>
        <textarea
          id="booking-purpose"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder={t("booking.purposePlaceholder")}
          maxLength={MAX_PURPOSE}
          rows={3}
          disabled={!hasAmenities}
          className={`w-full py-2.5 leading-relaxed placeholder:text-[var(--color-neutral-400)] ${CONTROL_CLS}`}
          style={{ minHeight: 88 }}
        />
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className={`pk-shine pk-press pk-in inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-600)] text-[15px] font-bold text-white transition-colors hover:bg-[var(--color-brand-700)] disabled:cursor-not-allowed disabled:bg-[var(--color-neutral-100)] disabled:text-[var(--color-neutral-400)] ${FOCUS_CLS}`}
        style={{ "--d": "240ms" }}
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {t("booking.submitting")}
          </>
        ) : (
          t("booking.submitCta")
        )}
      </button>

      {submitError ? (
        <p
          role="alert"
          className="text-[13px] font-semibold"
          style={{ color: "var(--color-danger)" }}
        >
          {submitError}
        </p>
      ) : null}

      {successOpen ? (
        <output
          aria-live="polite"
          className="pk-in fixed left-4 right-4 top-4 z-50 mx-auto inline-flex max-w-md items-center gap-2 rounded-[16px] border border-[var(--color-brand-500)] bg-[var(--color-brand-50)] px-4 py-3 text-[var(--color-neutral-900)] shadow-lg"
        >
          <CheckCircle2 size={16} aria-hidden="true" style={{ color: "var(--color-brand-600)" }} />
          <span className="text-sm font-semibold">{t("booking.submitSuccess")}</span>
        </output>
      ) : null}
    </form>
  );
}
