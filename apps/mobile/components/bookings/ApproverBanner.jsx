// ApproverBanner — read-only attribution banner for an approved/rejected booking.
//
// Visual contract per 05-UI-SPEC.md Screen 6 (BookingCard / ApproverBanner):
//   OwnerChip-shape pill with a success/danger tint:
//     approved → "Approved by {{name}} ({{flat}})" (booking.approvedBy, BOOK-06), success tint
//     rejected → "Rejected by {{name}} ({{flat}})" (booking.rejectedBy), danger tint
//
// This is the "loser sees read-only" surface (BOOK-03/05): once a board member
// wins the atomic approval, every other board member's card flips to this banner
// via Realtime. Hidden when there is no approver/rejecter name.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Check, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

const SUCCESS_500 = "#047857";
const SUCCESS_50 = "#ecfdf5";
const DANGER_500 = "#c81e1e";
const DANGER_50 = "#fef2f2";

/**
 * @param {{
 *   kind: 'approved'|'rejected',
 *   name?: string|null,
 *   flat?: string|null,
 * }} props
 */
export function ApproverBanner({ kind, name, flat }) {
  const { t } = useTranslation("bookings");
  if (!name) return null;

  const isApproved = kind === "approved";
  const key = isApproved ? "booking.approvedBy" : "booking.rejectedBy";
  const text = t(key, { name, flat: flat ?? "—" });

  const tint = isApproved ? SUCCESS_500 : DANGER_500;
  const bg = isApproved ? SUCCESS_50 : DANGER_50;
  const Icon = isApproved ? Check : X;

  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
      style={{ alignSelf: "flex-start", backgroundColor: bg, borderWidth: 1, borderColor: tint }}
      accessibilityRole="text"
      accessibilityLabel={text}
    >
      <Icon size={12} color={tint} />
      <Text className="text-sm" style={{ color: tint }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}
