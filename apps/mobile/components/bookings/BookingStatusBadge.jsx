// BookingStatusBadge — color-coded pill for booking status.
//
// Visual contract per 05-UI-SPEC.md "Booking Status Badge Colors — Complete Map":
//   pending  → #fffbeb bg / #f59e0b (warning.500) text / 1px warning.500 border (DD-6 — amber, NOT neutral)
//   approved → #ecfdf5 bg / #047857 (success.500) text / 1px success.500 border
//   rejected → #fef2f2 bg / #c81e1e (danger.500) text / 1px danger.500 border
//
// Mirrors the Phase 4 StatusBadge token shape (rounded-full px-2 py-0.5 text-sm,
// label ALWAYS present so color is never the sole signal). Labels come from
// bookings.json booking.statusPending/Approved/Rejected (locked Devanagari).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

const STATUS_STYLES = {
  pending: { bg: "#fffbeb", text: "#f59e0b", border: "#f59e0b" },
  approved: { bg: "#ecfdf5", text: "#047857", border: "#047857" },
  rejected: { bg: "#fef2f2", text: "#c81e1e", border: "#c81e1e" },
};

function resolveLabel(t, status) {
  if (status === "pending") return t("booking.statusPending");
  if (status === "approved") return t("booking.statusApproved");
  if (status === "rejected") return t("booking.statusRejected");
  return status;
}

/**
 * Booking status pill.
 *
 * @param {{ status: 'pending'|'approved'|'rejected' }} props
 */
export function BookingStatusBadge({ status }) {
  const { t } = useTranslation("bookings");
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  const label = resolveLabel(t, status);

  return (
    <View
      className="rounded-full px-2 py-0.5"
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
        borderWidth: 1,
        alignSelf: "flex-start",
      }}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
    >
      <Text className="text-sm" style={{ color: style.text }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// Left-stripe accent per status (DD-12 — bookings DO have a stripe, unlike notices).
// Exported so BookingCard picks the same accent without duplicating the table.
export const BOOKING_STATUS_ACCENT = {
  pending: "#f59e0b",
  approved: "#047857",
  rejected: "#c81e1e",
};
