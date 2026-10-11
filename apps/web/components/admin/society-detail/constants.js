// Shared constants for the society detail drawer panes.

import {
  Building2,
  CalendarRange,
  Check,
  ClipboardList,
  CreditCard,
  History,
  IndianRupee,
  MessageSquare,
} from "lucide-react";

export const ALL_PANES = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "features", label: "Features", icon: Check },
  { id: "requests", label: "Requests", icon: ClipboardList },
  { id: "monthly", label: "Monthly", icon: CalendarRange },
  { id: "history", label: "History", icon: History },
  { id: "billing", label: "Billing", icon: CreditCard, adminOnly: true },
  { id: "payments", label: "Payments", icon: IndianRupee, adminOnly: true },
  { id: "notes", label: "Notes", icon: MessageSquare },
];

export const PLANS = ["sprout", "neighbourhood", "township"];
export const STATUSES = ["trial", "active", "past_due", "cancelled"];

export const STATUS_TONE = {
  active: { bg: "var(--color-brand-50)", fg: "var(--color-brand-700)" },
  trial: { bg: "#E7F0FB", fg: "#1F5FA0" },
  past_due: { bg: "#FCE9E6", fg: "#94291A" },
  cancelled: { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-600)" },
};

export const field =
  "h-11 w-full rounded-xl border border-[var(--color-neutral-200)] bg-white px-3 text-[14px] outline-none focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]";
