"use client";

// VisitorInbox — the resident's gate approvals. Pending requests for their flat
// sit at the top with Approve / Deny; the list updates live via a realtime
// subscription (RLS visitor_requests_resident_read scopes rows to their flat).
// A decision that loses a race (ALREADY_DECIDED) or comes too late
// (VISIT_EXPIRED, > 30 min) shows a localized error; the list is re-read so the
// card reflects the real state.

import { residentDecideVisit } from "@parisar/api-client";
import { Check, DoorOpen, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, PageHeader, PageShell, SurfaceCard } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { uniqueChannelName } from "../shared/realtime";

const DECIDED_CLS = {
  approved: "bg-[var(--color-brand-50)] text-[var(--color-brand-700)]",
  denied: "bg-[#FCE9E6] text-[var(--color-danger)]",
  cancelled: "bg-[var(--color-neutral-100)] text-[var(--color-neutral-500)]",
  expired: "bg-[var(--color-neutral-100)] text-[var(--color-neutral-500)]",
};

const STATUS_KEY = {
  approved: "visitor.statusApproved",
  denied: "visitor.statusDenied",
  cancelled: "visitor.statusCancelled",
  expired: "visitor.statusExpired",
  pending: "visitor.statusPending",
};

// resident_decide_visit error code → i18n key (contract-055).
function decideErrorKey(code) {
  const c = String(code ?? "");
  if (c.includes("ALREADY_DECIDED")) return "visitor.alreadyDecided";
  if (c.includes("VISIT_EXPIRED")) return "visitor.visitExpired";
  return "visitor.decideError";
}

/**
 * @param {{ societyId?: string|null }} props — when given, the realtime channel is
 *   filtered to that society (RLS still scopes rows to the resident's flat).
 */
export function VisitorInbox({ societyId = null } = {}) {
  const { t } = useTranslation("auth");
  const { t: tNav } = useTranslation("dashboard");

  const [requests, setRequests] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [errors, setErrors] = useState({}); // requestId -> i18n key

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("visitor_requests")
      .select("id, visitor_name, visitor_phone, purpose, status, created_at")
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) return; // keep what is on screen; the next event retries
    setRequests(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    load();
    const filter = societyId ? { filter: `society_id=eq.${societyId}` } : {};
    const channel = supabase
      .channel(uniqueChannelName(`resident-visits-${societyId ?? "mine"}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visitor_requests", ...filter },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, societyId]);

  async function decide(id, approve) {
    if (busyId) return;
    setBusyId(id);
    setErrors((prev) => ({ ...prev, [id]: null }));
    let errorKey = null;
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await residentDecideVisit(supabase, { requestId: id, approve });
      if (res?.error) errorKey = decideErrorKey(res.error);
    } catch (err) {
      errorKey = decideErrorKey(err?.message);
    }
    if (errorKey) setErrors((prev) => ({ ...prev, [id]: errorKey }));
    try {
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <PageShell width="narrow">
      <PageHeader
        backHref="/dashboard"
        backLabel={tNav("nav.home")}
        title={t("visitor.inboxTitle")}
        description={t("visitor.inboxLead")}
      />

      {/* At the gate — needs a decision */}
      <section className="mb-8 flex flex-col gap-3">
        <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--color-neutral-400)]">
          {t("visitor.atGate")}
        </p>
        {pending.length === 0 ? (
          <EmptyState icon={DoorOpen} title={t("visitor.noPending")} />
        ) : (
          pending.map((r) => (
            <SurfaceCard key={r.id} className="p-5">
              <p className="text-[17px] font-extrabold tracking-[-0.01em] text-[var(--color-neutral-900)]">
                {r.visitor_name}
              </p>
              <p className="mt-0.5 text-[14px] text-[var(--color-neutral-600)]">
                {[r.purpose, r.visitor_phone].filter(Boolean).join(" · ") || t("visitor.gateLabel")}
              </p>
              <div className="mt-4 flex gap-2.5">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => decide(r.id, true)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--color-brand-600)] py-3 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <Check size={16} strokeWidth={2.6} aria-hidden="true" />
                  {t("visitor.approve")}
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => decide(r.id, false)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-neutral-200)] py-3 text-[15px] font-bold text-[var(--color-danger)] hover:bg-[#FCE9E6] disabled:opacity-60"
                >
                  <X size={16} strokeWidth={2.6} aria-hidden="true" />
                  {t("visitor.deny")}
                </button>
              </div>
              {errors[r.id] ? (
                <p
                  role="alert"
                  className="mt-3 text-[13px] font-semibold text-[var(--color-danger)]"
                >
                  {t(errors[r.id])}
                </p>
              ) : null}
            </SurfaceCard>
          ))
        )}
      </section>

      {/* History */}
      {decided.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--color-neutral-400)]">
            {t("visitor.recent")}
          </p>
          <ul className="flex flex-col gap-2">
            {decided.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-neutral-200)] bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-[var(--color-neutral-900)]">
                    {r.visitor_name}
                  </p>
                  {r.purpose ? (
                    <p className="text-[13px] text-[var(--color-neutral-500)]">{r.purpose}</p>
                  ) : null}
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-bold ${
                    DECIDED_CLS[r.status] ?? DECIDED_CLS.cancelled
                  }`}
                >
                  {t(STATUS_KEY[r.status] ?? "visitor.statusCancelled")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </PageShell>
  );
}
