"use client";

// GuardClient — the gate screen. The guard picks a flat, enters the visitor, and
// taps "Ask resident"; the request appears below and its status flips live
// (Pending → Approved/Denied) via a realtime subscription on visitor_requests
// (RLS scopes those rows to the guard's society).

import { guardCreateVisit, guardListFlats } from "@parisar/api-client";
import { Check, DoorOpen, LogOut, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SosAlerts } from "@/components/sos/SosAlerts";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const FIELD =
  "h-12 w-full rounded-xl border border-[var(--color-neutral-200)] bg-white px-3.5 text-[15px] outline-none focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]";

const STATUS = {
  pending: { key: "visitor.statusPending", cls: "bg-[#FDF0DF] text-[var(--color-warning)]" },
  approved: {
    key: "visitor.statusApproved",
    cls: "bg-[var(--color-brand-50)] text-[var(--color-brand-700)]",
  },
  denied: { key: "visitor.statusDenied", cls: "bg-[#FCE9E6] text-[var(--color-danger)]" },
  cancelled: {
    key: "visitor.statusDenied",
    cls: "bg-[var(--color-neutral-100)] text-[var(--color-neutral-500)]",
  },
};

export function GuardClient({ guardName, societyName }) {
  const { t } = useTranslation("auth");

  const [wings, setWings] = useState([]);
  const [flatId, setFlatId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadRequests = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("visitor_requests")
      .select("id, visitor_name, purpose, status, flat_id, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setRequests(Array.isArray(data) ? data : []);
  }, []);

  // Load flats + recent requests; subscribe to live status changes.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    guardListFlats(supabase)
      .then(setWings)
      .catch(() => setWings([]));
    loadRequests();

    const channel = supabase
      .channel("guard-visits")
      .on("postgres_changes", { event: "*", schema: "public", table: "visitor_requests" }, () =>
        loadRequests(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadRequests]);

  // flat_id -> "A-101" for display
  const flatLabel = (id) => {
    for (const w of wings) {
      const f = w.flats.find((x) => x.id === id);
      if (f) return [w.name, f.number].filter(Boolean).join("-");
    }
    return "";
  };

  async function raise(e) {
    e.preventDefault();
    setError(null);
    if (!flatId) return setError(t("visitor.flatRequired"));
    if (!name.trim()) return setError(t("visitor.nameRequired"));
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const res = await guardCreateVisit(supabase, {
        flatId,
        visitorName: name.trim(),
        visitorPhone: phone.trim(),
        purpose: purpose.trim(),
      });
      if (res?.error) {
        setError(t("visitor.raiseError"));
        setBusy(false);
        return;
      }
      setName("");
      setPhone("");
      setPurpose("");
      await loadRequests();
    } catch {
      setError(t("visitor.raiseError"));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-neutral-50)" }}>
      <div className="mx-auto w-full max-w-lg px-5 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
            >
              <ShieldCheck size={20} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--color-neutral-900)]">
                {t("visitor.gateTitle")} · {societyName}
              </h1>
              <p className="text-[13px] text-[var(--color-neutral-500)]">{guardName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label={t("logout")}
            className="rounded-lg p-2 text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-100)]"
          >
            <LogOut size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {/* Emergency SOS alerts targeted at the watchman */}
        <SosAlerts />

        {/* Raise a request */}
        <form
          onSubmit={raise}
          className="flex flex-col gap-4 rounded-2xl border border-[var(--color-neutral-200)] bg-white p-5"
        >
          <p className="text-[15px] font-bold text-[var(--color-neutral-900)]">
            {t("visitor.gateLead")}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("visitor.flat")}
            </span>
            <select value={flatId} onChange={(e) => setFlatId(e.target.value)} className={FIELD}>
              <option value="">{t("visitor.pickFlat")}</option>
              {wings.map((w) => (
                <optgroup key={w.id} label={w.name}>
                  {w.flats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {[w.name, f.number].filter(Boolean).join("-")}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("visitor.visitorName")}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("visitor.visitorNamePh")}
              maxLength={80}
              className={FIELD}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
                {t("visitor.visitorPhone")}
              </span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="tel"
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
                {t("visitor.purpose")}
              </span>
              <input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder={t("visitor.purposePh")}
                maxLength={60}
                className={FIELD}
              />
            </label>
          </div>
          {error ? (
            <p className="text-[13px] font-semibold text-[var(--color-danger)]">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="pk-press inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-brand-500)" }}
          >
            <DoorOpen size={17} strokeWidth={2.2} aria-hidden="true" />
            {busy ? t("visitor.raising") : t("visitor.raise")}
          </button>
        </form>

        {/* Recent / live status */}
        <div className="mt-6">
          <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--color-neutral-400)]">
            {t("visitor.recent")}
          </p>
          {requests.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--color-neutral-200)] px-4 py-6 text-center text-[14px] text-[var(--color-neutral-400)]">
              {t("visitor.noneYet")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {requests.map((r) => {
                const s = STATUS[r.status] ?? STATUS.pending;
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-neutral-200)] bg-white px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold text-[var(--color-neutral-900)]">
                        {r.visitor_name}
                      </p>
                      <p className="text-[13px] text-[var(--color-neutral-500)]">
                        {flatLabel(r.flat_id)}
                        {r.purpose ? ` · ${r.purpose}` : ""}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${s.cls}`}
                    >
                      {r.status === "approved" ? (
                        <Check size={13} strokeWidth={2.6} aria-hidden="true" />
                      ) : r.status === "denied" ? (
                        <X size={13} strokeWidth={2.6} aria-hidden="true" />
                      ) : null}
                      {t(s.key)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
