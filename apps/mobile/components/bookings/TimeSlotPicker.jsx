// TimeSlotPicker — date + paired start/end TIME inputs (DD-5).
//
// Visual contract per 05-UI-SPEC.md Screen 5 (Date + Time range):
//   - A single date field (datetimepicker `date` mode, min today, max today+30d) —
//     NOT a month-grid availability calendar (DD-5).
//   - Paired start + end TIME fields (datetimepicker `time` mode), side by side.
//   - Client validation (mirrors the request_booking RPC server checks, BOOK-01):
//       end > start                → booking.timeOrderError
//       duration <= 4h             → booking.durationError
//       within amenity open/close  → booking.hoursError
//       lead time >= 1h            → booking.leadTimeError
//       horizon <= 30d             → date picker max bound (no inline error needed)
//   - Helper text booking.timeHelper ("Up to 4 hours, within {{open}}–{{close}}.").
//   - Emits { startsAt, endsAt } as ISO timestamptz-ready strings via onChange, plus
//     a validity flag + the localized error so the parent can gate Submit.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, Text, View } from "react-native";

const MAX_DURATION_MS = 4 * 60 * 60 * 1000; // 4h
const MIN_LEAD_MS = 60 * 60 * 1000; // 1h
const MAX_HORIZON_MS = 30 * 24 * 60 * 60 * 1000; // 30d

// "06:00:00" / "06:00" → minutes-since-midnight (Number) for hours-bound checks.
function timeToMinutes(time) {
  if (!time) return null;
  const m = String(time).match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function hhmm(time) {
  if (!time) return "—";
  const m = String(time).match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : String(time);
}

/**
 * Compose a Date from a date-part Date and a time-part Date.
 */
function combine(datePart, timePart) {
  const d = new Date(datePart);
  d.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return d;
}

/**
 * Pure validator — returns { valid, error, startsAt, endsAt }.
 * `error` is a localized string (or null). startsAt/endsAt are ISO strings (or null).
 *
 * `t` is optional: when omitted (e.g. in pure unit tests that don't need
 * localized strings) the function falls back to returning the i18n key itself
 * (matching i18next's missing-instance behavior).
 *
 * @param {{ date: Date|null, start: Date|null, end: Date|null, amenity?: object|null, nowMs?: number, t?: Function }} args
 */
export function validateRange({ date, start, end, amenity = null, nowMs = Date.now(), t }) {
  const tt = typeof t === "function" ? t : (key) => key;
  if (!date || !start || !end) {
    return { valid: false, error: null, startsAt: null, endsAt: null };
  }

  const startsAt = combine(date, start);
  const endsAt = combine(date, end);

  const openMin = timeToMinutes(amenity?.open_time);
  const closeMin = timeToMinutes(amenity?.close_time);
  const openLabel = hhmm(amenity?.open_time);
  const closeLabel = hhmm(amenity?.close_time);

  // 1. End must be after start.
  if (endsAt.getTime() <= startsAt.getTime()) {
    return { valid: false, error: tt("booking.timeOrderError"), startsAt: null, endsAt: null };
  }

  // 2. Duration <= 4h.
  if (endsAt.getTime() - startsAt.getTime() > MAX_DURATION_MS) {
    return { valid: false, error: tt("booking.durationError"), startsAt: null, endsAt: null };
  }

  // 3. Lead time >= 1h from now.
  if (startsAt.getTime() - nowMs < MIN_LEAD_MS) {
    return { valid: false, error: tt("booking.leadTimeError"), startsAt: null, endsAt: null };
  }

  // 4. Horizon <= 30d.
  if (startsAt.getTime() - nowMs > MAX_HORIZON_MS) {
    return {
      valid: false,
      error: tt("booking.leadTimeError"), // out-of-horizon is bounded by the picker; reuse a soft error
      startsAt: null,
      endsAt: null,
    };
  }

  // 5. Within amenity open/close hours (both endpoints).
  if (openMin !== null && closeMin !== null) {
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes();
    if (startMin < openMin || endMin > closeMin) {
      const error = tt("booking.hoursError", { open: openLabel, close: closeLabel });
      return { valid: false, error, startsAt: null, endsAt: null };
    }
  }

  return {
    valid: true,
    error: null,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
}

/**
 * @param {{
 *   amenity?: object|null,
 *   onChange: (result: { valid: boolean, error: string|null, startsAt: string|null, endsAt: string|null }) => void,
 * }} props
 */
export function TimeSlotPicker({ amenity = null, onChange }) {
  const { t } = useTranslation("bookings");
  const [date, setDate] = useState(null);
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [showPicker, setShowPicker] = useState(null); // 'date' | 'start' | 'end' | null

  const today = new Date();
  const maxDate = new Date(Date.now() + MAX_HORIZON_MS);

  const result = validateRange({ date, start, end, amenity, t });

  function emit(next) {
    const r = validateRange({
      date: next.date ?? date,
      start: next.start ?? start,
      end: next.end ?? end,
      amenity,
      t,
    });
    onChange?.(r);
  }

  function onPickerChange(event, value) {
    // Android dismisses on its own; iOS keeps the spinner open until tapped away.
    if (Platform.OS !== "ios") setShowPicker(null);
    if (event?.type === "dismissed" || !value) return;

    if (showPicker === "date") {
      setDate(value);
      emit({ date: value });
    } else if (showPicker === "start") {
      setStart(value);
      emit({ start: value });
    } else if (showPicker === "end") {
      setEnd(value);
      emit({ end: value });
    }
  }

  const openLabel = hhmm(amenity?.open_time);
  const closeLabel = hhmm(amenity?.close_time);
  const helper = t("booking.timeHelper", { open: openLabel, close: closeLabel });

  return (
    <View className="gap-3">
      {/* Date */}
      <View className="gap-1">
        <Text className="text-sm text-neutral-600">{t("booking.dateLabel")}</Text>
        <Pressable
          onPress={() => setShowPicker("date")}
          accessibilityRole="button"
          accessibilityLabel={t("booking.dateLabel")}
          className="h-12 px-3 rounded-xl border border-neutral-200 bg-white justify-center"
        >
          <Text
            className={date ? "text-base text-neutral-900" : "text-base text-neutral-400"}
            numberOfLines={1}
          >
            {date ? format(date, "EEE, dd MMM yyyy") : t("booking.dateLabel")}
          </Text>
        </Pressable>
      </View>

      {/* Time range — paired start/end */}
      <View className="gap-1">
        <Text className="text-sm text-neutral-600">{t("booking.timeLabel")}</Text>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => setShowPicker("start")}
            accessibilityRole="button"
            accessibilityLabel={`${t("booking.timeLabel")} start`}
            className="flex-1 h-12 px-3 rounded-xl border border-neutral-200 bg-white justify-center"
          >
            <Text
              className={start ? "text-base text-neutral-900" : "text-base text-neutral-400"}
              numberOfLines={1}
            >
              {start ? format(start, "HH:mm") : "--:--"}
            </Text>
          </Pressable>
          <Text className="text-base text-neutral-400">{"→"}</Text>
          <Pressable
            onPress={() => setShowPicker("end")}
            accessibilityRole="button"
            accessibilityLabel={`${t("booking.timeLabel")} end`}
            className="flex-1 h-12 px-3 rounded-xl border border-neutral-200 bg-white justify-center"
          >
            <Text
              className={end ? "text-base text-neutral-900" : "text-base text-neutral-400"}
              numberOfLines={1}
            >
              {end ? format(end, "HH:mm") : "--:--"}
            </Text>
          </Pressable>
        </View>
        <Text className="text-sm text-neutral-400">{helper}</Text>

        {/* Inline validation error (only when both times chosen and invalid) */}
        {date && start && end && result.error ? (
          <Text className="text-sm text-danger-500" accessibilityRole="alert">
            {result.error}
          </Text>
        ) : null}
      </View>

      {showPicker ? (
        <DateTimePicker
          value={
            showPicker === "date"
              ? (date ?? today)
              : showPicker === "start"
                ? (start ?? today)
                : (end ?? today)
          }
          mode={showPicker === "date" ? "date" : "time"}
          is24Hour
          minimumDate={showPicker === "date" ? today : undefined}
          maximumDate={showPicker === "date" ? maxDate : undefined}
          onChange={onPickerChange}
        />
      ) : null}
    </View>
  );
}
