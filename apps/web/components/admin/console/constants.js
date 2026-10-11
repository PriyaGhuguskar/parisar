// Shared constants and helpers for the staff console sections.

import { Building2, Inbox, LayoutDashboard, Tag, UserPlus, Users } from "lucide-react";

// `group: true` renders a non-interactive header; `sub: true` indents beneath
// it. Requests split in two because they are now two different queues from two
// different tables — society enrollment leads, and salesperson applications.
export const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "societies", label: "Societies", icon: Building2 },
  { id: "requests", label: "Requests", icon: Inbox, group: true },
  { id: "requestsSociety", label: "Society requests", icon: Building2, sub: true },
  { id: "requestsSales", label: "Sales requests", icon: UserPlus, sub: true },
  { id: "peopleSales", label: "All salespersons", icon: UserPlus, adminOnly: true },
  { id: "peopleStaff", label: "All staff", icon: Users, adminOnly: true },
  { id: "catalogue", label: "Features & pricing", icon: Tag },
];

// States and union territories. A select, not a text field: "MH", "Maharastra"
// and "maharashtra " would otherwise all land in the same column and make any
// grouping by state useless.
export const STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman & Nicobar Islands",
  "Chandigarh",
  "Dadra & Nagar Haveli and Daman & Diu",
  "Delhi",
  "Jammu & Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

export const input =
  "a-field h-12 w-full rounded-xl border border-[var(--color-neutral-200)] bg-white px-3.5 text-[14px] text-[var(--color-neutral-900)] outline-none placeholder:text-[var(--color-neutral-400)]";

// Quieter than the primary "New society" CTA — these are occasional admin
// chores, not the console's main action.
export const secondaryCta =
  "flex items-center justify-center gap-2 rounded-xl border border-[var(--color-neutral-200)] bg-white px-3 py-2.5 text-[13px] font-semibold text-[var(--color-neutral-700)] transition-colors hover:border-[var(--color-brand-500)] hover:text-[var(--color-brand-700)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2";

export const EMPTY_FORM = {
  name: "",
  addressLine: "",
  city: "",
  landmark: "",
  state: "",
  pincode: "",
  // Society Authorities: everyone who will manage the society (name + mobile).
  authorities: [{ name: "", phone: "" }],
};

export const PHONE_RE = /^[6-9]\d{9}$/;

export function fmtWhen(lead) {
  if (lead.call_now) return "ASAP";
  if (!lead.preferred_at) return lead.preferred_slot ?? "—";
  return new Date(lead.preferred_at).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
