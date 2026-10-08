// Human-readable lines for the staff society History tab (admin_society_history).
// Pure — no React — so it can be unit-tested. The admin console is English-only.

export const HISTORY_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "account", label: "Account & billing" },
  { id: "setup", label: "Setup & members" },
  { id: "activity", label: "Resident activity" },
];

const ACCOUNT = /^(society\.|authority\.|chairman\.|feature\.|billing\.|payment\.)/;
const SETUP = /^(structure\.|wing\.|setup\.|member\.|guard\.|code\.|role\.|family\.|admin\.)/;

/** Noise that never helps staff understand a society. */
const HIDDEN = new Set(["pin.set"]);

export function categoryOf(action) {
  if (ACCOUNT.test(action)) return "account";
  if (SETUP.test(action)) return "setup";
  return "activity";
}

export function isVisible(event) {
  return !HIDDEN.has(event?.action);
}

function rupees(n) {
  return `₹${Number(n ?? 0).toLocaleString("en-IN")}`;
}

function humanize(action) {
  const text = String(action ?? "").replace(/[._]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * @param {{action:string, payload?:object, feature_name?:string|null}} e
 * @returns {{title:string, detail?:string}}
 */
export function describeEvent(e) {
  const p = e?.payload ?? {};
  const feature = e?.feature_name ?? p.feature ?? "a feature";
  switch (e?.action) {
    case "society.created_by_admin": {
      const names = Array.isArray(p.authorities)
        ? p.authorities
            .map((a) => a?.name)
            .filter(Boolean)
            .join(", ")
        : p.secretary_name;
      return {
        title: "Society created",
        detail: [
          names ? `Authorities: ${names}` : null,
          p.request_id ? "From an enrolment request" : null,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }
    case "society.created":
      return { title: "Society created (self-serve)" };
    case "society.service_paused":
      return { title: "Service stopped", detail: p.reason ? `“${p.reason}”` : undefined };
    case "society.service_blocked":
      return { title: "Society blocked", detail: p.reason ? `“${p.reason}”` : undefined };
    case "society.service_resumed":
      return { title: "Service resumed" };
    case "authority.added":
      return {
        title: `Authority added: ${p.name ?? "—"}`,
        detail: [
          p.phone ? `+91 ${p.phone}` : null,
          p.linked ? "already a resident — powers given now" : null,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    case "authority.claimed":
      return { title: "Authority signed in" };
    case "authority.updated":
      return { title: `Authority details updated: ${p.name ?? "—"}` };
    case "chairman.claimed":
      return { title: "Chairman signed in" };
    case "chairman.updated":
      return { title: `Chairman details updated: ${p.name ?? "—"}` };
    case "feature.changed":
      return {
        title: `${feature} turned ${p.enabled ? "ON" : "OFF"}`,
        detail:
          p.price_override != null
            ? `Price for this society: ${rupees(p.price_override)}/mo`
            : undefined,
      };
    case "feature.price_changed":
      return { title: `${feature} list price changed` };
    case "feature.requested":
      return {
        title: `Requested to ${p.request === "remove" ? "remove" : "add"} ${feature}`,
        detail: p.note ? `“${p.note}”` : undefined,
      };
    case "feature.request_approved":
      return {
        title: `Approved: ${p.request === "remove" ? "remove" : "add"} ${feature}`,
        detail: p.note ? `“${p.note}”` : undefined,
      };
    case "feature.request_declined":
      return {
        title: `Declined: ${p.request === "remove" ? "remove" : "add"} ${feature}`,
        detail: p.note ? `“${p.note}”` : undefined,
      };
    case "billing.updated":
      return {
        title: "Billing updated",
        detail: [
          p.plan ? `Plan ${p.plan}` : null,
          p.status ? `status ${p.status}` : null,
          p.amount != null ? `${rupees(p.amount)}/mo` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    case "payment.recorded":
      return {
        title: `Payment recorded${p.amount != null ? `: ${rupees(p.amount)}` : ""}`,
        detail: [p.method, p.paid_on].filter(Boolean).join(" · ") || undefined,
      };
    case "payment.deleted":
      return { title: "Payment entry deleted" };
    case "structure.bootstrapped":
      return { title: "Wings and flats set up" };
    case "wing.added":
      return { title: `Wing added${(p.wing_name ?? p.name) ? `: ${p.wing_name ?? p.name}` : ""}` };
    case "member.joined":
      return {
        title: p.authority ? "Authority joined as a resident" : "Resident joined",
        detail: p.status === "pending_review" ? "Pending approval" : undefined,
      };
    case "member.removed":
      return { title: "Resident removed" };
    case "guard.added":
      return { title: `Gate guard added${p.name ? `: ${p.name}` : ""}` };
    case "code.rotated":
      return { title: "Join code changed" };
    case "code.auto_paused":
      return { title: "Join code paused automatically" };
    case "code.resumed":
      return { title: "Join code resumed" };
    case "role.transferred":
    case "role.changed":
      return { title: "Member role changed" };
    case "admin.society_viewed":
      return { title: "Viewed by Parisar staff" };
    default:
      return { title: humanize(e?.action) };
  }
}
