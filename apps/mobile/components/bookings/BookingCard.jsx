// BookingCard — list row for a single amenity booking.
//
// Visual contract per 05-UI-SPEC.md Screen 6:
//   - Surface: bg-white rounded-xl border border-neutral-200 p-4, with a 4px LEFT
//     stripe colored by status (DD-12 — bookings DO have a stripe, unlike notices):
//     pending=amber / approved=green / rejected=red (BOOKING_STATUS_ACCENT).
//   - Layout: 56×56 brand.50 date pill (day number over month abbrev) + amenity name
//     (Heading 20/600) + BookingStatusBadge; time range "{{start}}–{{end}}" (HH:mm);
//     purpose 1-line preview; "Requested by {{name}} ({{flat}})" (board mode);
//     ApproverBanner when approved/rejected.
//
// The list query (listBookings) embeds amenity {name,open_time,close_time}, requester
// {full_name}, requester_flat/approver_flat/rejecter_flat {number, wing{name}}.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { ApproverBanner } from "./ApproverBanner";
import { BOOKING_STATUS_ACCENT, BookingStatusBadge } from "./BookingStatusBadge";

const BRAND_500 = "#12715A";

function formatFlat(flat) {
  if (!flat) return "—";
  const wing = flat?.wing?.name ?? "";
  const num = flat?.number ?? "";
  return [wing, num].filter(Boolean).join("-") || "—";
}

// Parse a tstzrange string like "[2026-06-18 18:00:00+00,2026-06-18 20:00:00+00)"
// OR a {start,end} object into start/end Date objects. Tolerates both shapes.
function parseRange(timeRange) {
  if (!timeRange) return { start: null, end: null };
  if (typeof timeRange === "object" && (timeRange.start || timeRange.lower)) {
    return {
      start: timeRange.start ?? timeRange.lower ?? null,
      end: timeRange.end ?? timeRange.upper ?? null,
    };
  }
  const s = String(timeRange);
  const m = s.match(/[[(]\s*"?([^",]+)"?\s*,\s*"?([^"),]+)"?\s*[\])]/);
  if (!m) return { start: null, end: null };
  return { start: m[1], end: m[2] };
}

function safeTime(value) {
  if (!value) return "";
  try {
    return format(new Date(value), "HH:mm");
  } catch {
    return "";
  }
}

function datePill(value) {
  if (!value) return { day: "--", month: "" };
  try {
    const d = new Date(value);
    return { day: format(d, "dd"), month: format(d, "MMM").toUpperCase() };
  } catch {
    return { day: "--", month: "" };
  }
}

/**
 * @param {{
 *   booking: object,
 *   onPress?: (booking: object) => void,
 *   boardMode?: boolean,
 *   children?: React.ReactNode,   // board action row / banners injected by the list
 * }} props
 */
export function BookingCard({ booking, onPress, boardMode = false, children }) {
  const { t } = useTranslation("bookings");
  const status = booking?.status ?? "pending";
  const accent = BOOKING_STATUS_ACCENT[status] ?? BOOKING_STATUS_ACCENT.pending;

  const amenityName = booking?.amenity?.name ?? "—";
  const { start, end } = parseRange(booking?.time_range);
  const pill = datePill(start);
  const timeRange = `${safeTime(start)}–${safeTime(end)}`;

  const requesterName = booking?.requester?.full_name ?? "—";
  const requesterFlat = formatFlat(booking?.requester_flat);
  const requestedByText = t("booking.requestedBy", { name: requesterName, flat: requesterFlat });

  const approverName = booking?.approver?.full_name ?? null;
  const approverFlat = formatFlat(booking?.approver_flat);
  const rejecterName = booking?.rejecter?.full_name ?? null;
  const rejecterFlat = formatFlat(booking?.rejecter_flat);

  const a11yLabel = `${status} booking: ${amenityName} ${timeRange}`;

  const Wrapper = onPress ? Pressable : View;
  const wrapperProps = onPress
    ? {
        onPress: () => onPress(booking),
        accessibilityRole: "button",
        accessibilityLabel: a11yLabel,
      }
    : { accessibilityLabel: a11yLabel };

  return (
    <Wrapper
      {...wrapperProps}
      className="flex-row bg-white rounded-xl border border-neutral-200 overflow-hidden"
    >
      {/* Left accent stripe (DD-12) */}
      <View style={{ width: 4, backgroundColor: accent }} />

      <View className="flex-1 p-4 gap-2">
        <View className="flex-row gap-3">
          {/* 56×56 date pill */}
          <View
            className="rounded-xl items-center justify-center"
            style={{ width: 56, height: 56, backgroundColor: "#f5f7ff" }}
            accessibilityElementsHidden
          >
            <Text className="text-xl font-semibold" style={{ color: BRAND_500 }}>
              {pill.day}
            </Text>
            <Text className="text-sm" style={{ color: BRAND_500 }}>
              {pill.month}
            </Text>
          </View>

          <View className="flex-1 gap-1">
            <View className="flex-row items-start gap-2">
              <Text className="text-xl font-semibold text-neutral-900 flex-1" numberOfLines={1}>
                {amenityName}
              </Text>
              <BookingStatusBadge status={status} />
            </View>
            <Text className="text-sm text-neutral-600" numberOfLines={1}>
              {timeRange}
            </Text>
            {booking?.purpose ? (
              <Text className="text-base text-neutral-900" numberOfLines={1}>
                {booking.purpose}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Requested-by (board mode) */}
        {boardMode ? (
          <View
            className="flex-row items-center gap-1 rounded-full px-2 py-0.5 bg-neutral-100"
            style={{ alignSelf: "flex-start" }}
            accessibilityRole="text"
            accessibilityLabel={requestedByText}
          >
            <Text className="text-sm text-neutral-600" numberOfLines={1}>
              {requestedByText}
            </Text>
          </View>
        ) : null}

        {/* Approver / rejecter attribution */}
        {status === "approved" ? (
          <ApproverBanner kind="approved" name={approverName} flat={approverFlat} />
        ) : null}
        {status === "rejected" ? (
          <ApproverBanner kind="rejected" name={rejecterName} flat={rejecterFlat} />
        ) : null}

        {/* Rejection reason (visible to the member so they know why) */}
        {status === "rejected" && booking?.rejection_reason ? (
          <Text className="text-base text-neutral-900" numberOfLines={3}>
            {booking.rejection_reason}
          </Text>
        ) : null}

        {/* Slot injected by the list: action row (board) / awaiting line (member) / banners */}
        {children}
      </View>
    </Wrapper>
  );
}
