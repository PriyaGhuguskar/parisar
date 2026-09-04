"use client";

// Parisar staff console — sidebar shell, five sections, society detail drawer.
//
// DELIBERATELY NOT INTERNATIONALISED: internal tooling, never seen by a
// resident. Forcing en/hi/mr parity on strings nobody reads in those languages
// is busywork. Same precedent as DevOtpHint; everything resident-facing stays
// fully translated.
//
// Every read goes through a SECURITY DEFINER RPC rather than widened RLS, so the
// tenant boundary on societies/memberships is never loosened. The RPCs return no
// resident names, no resident phone numbers and no individual poll votes —
// staff get the operational picture, not the residents.

import {
  Building2,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Inbox,
  IndianRupee,
  LayoutDashboard,
  Loader2,
  LogOut,
  Pencil,
  Phone,
  Plus,
  Tag,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SocietyDetail } from "./SocietyDetail";

const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "societies", label: "Societies", icon: Building2 },
  { id: "requests", label: "Requests", icon: Inbox },
  { id: "catalogue", label: "Features & pricing", icon: Tag },
];

// States and union territories. A select, not a text field: "MH", "Maharastra"
// and "maharashtra " would otherwise all land in the same column and make any
// grouping by state useless.
const STATES = [
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

const input =
  "a-field h-12 w-full rounded-xl border border-[var(--color-neutral-200)] bg-white px-3.5 text-[14px] text-[var(--color-neutral-900)] outline-none placeholder:text-[var(--color-neutral-400)]";

const EMPTY_FORM = {
  name: "",
  addressLine: "",
  city: "",
  landmark: "",
  state: "",
  pincode: "",
  secName: "",
  secPhone: "",
};

function fmtWhen(lead) {
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

function Stat({ icon: Icon, value, label, tone }) {
  const tones = {
    urgent: { bg: "#FDF0DF", fg: "#8A4708" },
    danger: { bg: "#FCE9E6", fg: "#94291A" },
  };
  const t = tones[tone] ?? { bg: "var(--color-brand-50)", fg: "var(--color-brand-600)" };
  return (
    <div className="a-lift rounded-2xl border border-[var(--color-neutral-200)] bg-white p-5">
      <span
        aria-hidden="true"
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
        style={{ backgroundColor: t.bg, color: t.fg }}
      >
        <Icon size={17} strokeWidth={2.2} />
      </span>
      <p className="mt-3 text-[26px] font-extrabold leading-none tabular-nums tracking-[-0.03em] text-[var(--color-neutral-900)]">
        {value}
      </p>
      <p className="mt-1.5 text-[13px] font-semibold text-[var(--color-neutral-600)]">{label}</p>
    </div>
  );
}

export function AdminConsole({
  isAdmin = false,
  initialLeads = [],
  initialSocieties = [],
  initialStats = {},
  initialFeatures = [],
}) {
  const [section, setSection] = useState("overview");
  const [leads, setLeads] = useState(initialLeads ?? []);
  const [societies, setSocieties] = useState(initialSocieties ?? []);
  const [stats, setStats] = useState(initialStats ?? {});
  const [openId, setOpenId] = useState(null);
  const [features, setFeatures] = useState(initialFeatures ?? []);
  const [priceEdit, setPriceEdit] = useState(null); // { key, val }

  async function saveListPrice(key, price) {
    const supabase = createSupabaseBrowserClient();
    await supabase.rpc("admin_set_feature_price", { p_feature_key: key, p_price: price });
    const { data } = await supabase
      .from("platform_features")
      .select("key, name, description, price_monthly, is_core")
      .order("sort_order");
    if (data) setFeatures(data);
    setPriceEdit(null);
  }

  const [active, setActive] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const supabase = createSupabaseBrowserClient();
    const [{ data: s }, { data: st }] = await Promise.all([
      supabase.rpc("admin_list_societies"),
      supabase.rpc("admin_stats"),
    ]);
    if (s) setSocieties(s);
    if (st) setStats(st);
  }

  function startFromLead(lead) {
    setActive(lead);
    setCreated(null);
    setErr(null);
    // Prefill so staff retype as little as possible while on the call.
    setForm({
      ...EMPTY_FORM,
      name: lead.society_name ?? "",
      secName: lead.contact_name ?? "",
      secPhone: (lead.phone ?? "").replace(/^\+91/, ""),
    });
    setSection("create");
  }

  async function createSociety(e) {
    e.preventDefault();
    setErr(null);
    // Mirrors the RPC's checks so staff are told before a round trip. The
    // database is still the gate — that endpoint is directly reachable.
    if (form.name.trim().length < 3) return setErr("Society name needs at least 3 characters.");
    if (form.addressLine.trim().length < 5) return setErr("Enter the street address.");
    if (form.city.trim().length < 2) return setErr("Enter the city.");
    if (!form.state) return setErr("Select the state.");
    if (!/^[1-9]\d{5}$/.test(form.pincode))
      return setErr("PIN code must be 6 digits and cannot start with 0.");
    if (form.secName.trim().length < 2) return setErr("Enter the chairman's name.");
    if (!/^[6-9]\d{9}$/.test(form.secPhone)) return setErr("Chairman phone must be 10 digits.");

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("admin_create_society", {
        p_name: form.name.trim(),
        p_address_line: form.addressLine.trim(),
        p_city: form.city.trim(),
        p_state: form.state,
        p_pincode: form.pincode,
        p_landmark: form.landmark.trim() || null,
        p_secretary_name: form.secName.trim(),
        p_secretary_phone: form.secPhone,
        p_request_id: active?.id ?? null,
      });
      if (error) {
        setErr(error.message.replace(/_/g, " ").toLowerCase());
        setBusy(false);
        return;
      }
      setCreated({ code: data.code, society: form.name.trim(), chairman: form.secName.trim() });
      if (active) setLeads((l) => l.filter((x) => x.id !== active.id));
      await refresh();
      setBusy(false);
    } catch {
      setErr("Could not create the society. Check your connection.");
      setBusy(false);
    }
  }

  const open = societies.find((s) => s.id === openId);

  return (
    <div
      className="admin-scope flex min-h-screen"
      style={{ backgroundColor: "var(--color-neutral-50)" }}
    >
      {/* ---------------- sidebar ---------------- */}
      <aside
        className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-[var(--color-neutral-200)] lg:flex"
        style={{ background: "linear-gradient(180deg, #fff, var(--color-neutral-50))" }}
      >
        <div className="flex h-[68px] items-center gap-2.5 px-5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-[11px] shadow-[0_4px_10px_-3px_rgba(18,113,90,.5)]"
            style={{
              color: "#fff",
            }}
          >
            <Image
              src="/parisar-mark-96.png"
              alt=""
              aria-hidden="true"
              width={34}
              height={34}
              className="h-full w-full object-contain"
            />
          </span>
          <span className="text-[17px] font-extrabold tracking-[-0.03em] text-[var(--color-neutral-900)]">
            Parisar
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.06em]"
            style={
              isAdmin
                ? { backgroundColor: "var(--color-brand-50)", color: "var(--color-brand-700)" }
                : { backgroundColor: "#E7F0FB", color: "#1F5FA0" }
            }
          >
            {isAdmin ? "ADMIN" : "SALES"}
          </span>
        </div>

        <p className="px-5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--color-neutral-400)]">
          Manage
        </p>
        <nav className="a-stagger flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map(({ id, label, icon: Icon }) => {
            const on = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                aria-current={on ? "page" : undefined}
                className="a-nav group/nav relative flex items-center gap-3 rounded-xl py-2 pl-2 pr-3 text-left text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
                style={{
                  backgroundColor: on ? "var(--color-brand-50)" : "transparent",
                  color: on ? "var(--color-brand-700)" : "var(--color-neutral-600)",
                }}
              >
                {/* Accent bar — grows in when active. */}
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-200"
                  style={{
                    height: on ? "20px" : "0px",
                    backgroundColor: "var(--color-brand-500)",
                  }}
                />
                {/* Icon in a well that fills when active. */}
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200"
                  style={{
                    backgroundColor: on ? "var(--color-brand-500)" : "var(--color-neutral-100)",
                    color: on ? "#fff" : "var(--color-neutral-600)",
                  }}
                >
                  <Icon size={16} strokeWidth={2.2} />
                </span>
                {label}
                {id === "requests" && leads.length > 0 ? (
                  <span
                    className="ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                    style={{ backgroundColor: "#FDF0DF", color: "#8A4708" }}
                  >
                    {leads.length}
                  </span>
                ) : null}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setActive(null);
              setCreated(null);
              setForm(EMPTY_FORM);
              setSection("create");
            }}
            className="a-btn a-shine mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
          >
            <Plus size={16} strokeWidth={2.6} aria-hidden="true" />
            New society
          </button>
        </nav>

        <a
          href="/dashboard"
          className="group/leave m-3 flex items-center gap-2.5 rounded-xl border border-[var(--color-neutral-200)] bg-white px-3 py-2.5 text-[13px] font-semibold text-[var(--color-neutral-600)] transition-colors hover:border-[var(--color-brand-500)] hover:text-[var(--color-brand-700)]"
        >
          <LogOut
            size={15}
            strokeWidth={2.2}
            aria-hidden="true"
            className="transition-transform group-hover/leave:-translate-x-0.5"
          />
          Leave staff view
        </a>
      </aside>

      {/* ---------------- main ---------------- */}
      <main className="min-w-0 flex-1">
        {/* mobile section switcher — the sidebar is desktop-only */}
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-neutral-200)] bg-white p-2 lg:hidden">
          {NAV.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className="shrink-0 rounded-full px-3.5 py-2 text-[13px] font-bold"
              style={{
                backgroundColor: section === id ? "var(--color-brand-500)" : "transparent",
                color: section === id ? "#fff" : "var(--color-neutral-600)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div key={section} className="a-rise mx-auto w-full max-w-5xl p-5 lg:p-8">
          {/* ---------------- overview ---------------- */}
          {section === "overview" ? (
            <>
              <h1 className="text-[24px] font-extrabold tracking-[-0.025em] text-[var(--color-neutral-900)]">
                Overview
              </h1>
              <div className="a-stagger mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Stat icon={Building2} value={stats.societies ?? 0} label="Societies" />
                <Stat icon={Users} value={stats.residents ?? 0} label="Residents" />
                <Stat
                  icon={IndianRupee}
                  value={`₹${Number(stats.mrr ?? 0).toLocaleString("en-IN")}`}
                  label="Monthly recurring"
                />
                <Stat icon={Inbox} value={stats.open_requests ?? 0} label="Open requests" />
                <Stat
                  icon={Zap}
                  value={stats.urgent_requests ?? 0}
                  label="Waiting for a call now"
                  tone="urgent"
                />
                <Stat
                  icon={TriangleAlert}
                  value={stats.past_due ?? 0}
                  label="Past due"
                  tone="danger"
                />
              </div>

              {leads.length > 0 ? (
                <>
                  <h2 className="mt-10 text-[16px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
                    Next calls
                  </h2>
                  <div className="mt-3 flex flex-col gap-2">
                    {leads.slice(0, 3).map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => startFromLead(lead)}
                        className="pk-press flex items-center justify-between gap-3 rounded-xl border border-[var(--color-neutral-200)] bg-white p-3.5 text-left"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-bold text-[var(--color-neutral-900)]">
                            {lead.society_name}
                          </span>
                          <span className="block text-[12.5px] text-[var(--color-neutral-600)]">
                            {lead.contact_name} · {lead.phone}
                          </span>
                        </span>
                        <span className="shrink-0 text-[12px] font-bold text-[var(--color-neutral-400)]">
                          {fmtWhen(lead)}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {/* ---------------- societies ---------------- */}
          {section === "societies" ? (
            <>
              <h1 className="text-[24px] font-extrabold tracking-[-0.025em] text-[var(--color-neutral-900)]">
                Societies
              </h1>
              <p className="mt-1.5 text-[14px] text-[var(--color-neutral-600)]">
                Select a society to manage its features, billing and follow-up notes.
              </p>

              <div className="mt-6 flex flex-col gap-2">
                {societies.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--color-neutral-200)] bg-white px-6 py-14 text-center">
                    <p className="text-[15px] font-bold text-[var(--color-neutral-900)]">
                      No societies yet
                    </p>
                  </div>
                ) : (
                  societies.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setOpenId(s.id)}
                      className="pk-press a-lift flex items-center gap-4 rounded-2xl border border-[var(--color-neutral-200)] bg-white p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold text-[var(--color-neutral-900)]">
                          {s.name}
                        </p>
                        <p className="mt-0.5 text-[12.5px] text-[var(--color-neutral-600)]">
                          {[s.city, s.state].filter(Boolean).join(", ") || "—"}
                          {s.pincode ? ` · ${s.pincode}` : ""}
                        </p>
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        <p className="font-mono text-[13px] font-bold tracking-[0.08em] text-[var(--color-brand-700)]">
                          {s.code ?? "—"}
                        </p>
                        <p className="mt-0.5 text-[12px] tabular-nums text-[var(--color-neutral-400)]">
                          {s.member_count} residents
                          {Number(s.pending_count) > 0 ? ` · ${s.pending_count} pending` : ""}
                        </p>
                      </div>
                      <ChevronRight
                        size={16}
                        className="shrink-0 text-[var(--color-neutral-400)]"
                        aria-hidden="true"
                      />
                    </button>
                  ))
                )}
              </div>
            </>
          ) : null}

          {/* ---------------- requests ---------------- */}
          {section === "requests" ? (
            <>
              <h1 className="text-[24px] font-extrabold tracking-[-0.025em] text-[var(--color-neutral-900)]">
                Enrollment requests
              </h1>
              <p className="mt-1.5 text-[14px] text-[var(--color-neutral-600)]">
                Ring the top one first — "call me now" comes before scheduled slots.
              </p>
              <div className="mt-6 flex flex-col gap-2.5">
                {leads.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--color-neutral-200)] bg-white px-6 py-14 text-center">
                    <p className="text-[15px] font-bold text-[var(--color-neutral-900)]">
                      No open requests
                    </p>
                    <p className="mt-1.5 text-[13px] text-[var(--color-neutral-600)]">
                      Submissions from the public form land here.
                    </p>
                  </div>
                ) : (
                  leads.map((lead) => (
                    <div
                      key={lead.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-neutral-200)] bg-white p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-bold text-[var(--color-neutral-900)]">
                          {lead.society_name}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--color-neutral-600)]">
                          <Phone size={12} strokeWidth={2.4} aria-hidden="true" />
                          {lead.contact_name} ·{" "}
                          <a
                            href={`tel:${lead.phone}`}
                            className="font-semibold text-[var(--color-brand-600)] hover:underline"
                          >
                            {lead.phone}
                          </a>
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={
                            lead.call_now
                              ? { backgroundColor: "#FDF0DF", color: "#8A4708" }
                              : {
                                  backgroundColor: "var(--color-neutral-100)",
                                  color: "var(--color-neutral-600)",
                                }
                          }
                        >
                          {lead.call_now ? (
                            <Zap size={11} strokeWidth={2.6} aria-hidden="true" />
                          ) : (
                            <Clock size={11} strokeWidth={2.4} aria-hidden="true" />
                          )}
                          {fmtWhen(lead)}
                        </span>
                        <button
                          type="button"
                          onClick={() => startFromLead(lead)}
                          className="pk-press rounded-full px-4 py-2 text-[13px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                          style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
                        >
                          Create society
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : null}

          {/* ---------------- catalogue ---------------- */}
          {section === "catalogue" ? (
            <>
              <h1 className="text-[24px] font-extrabold tracking-[-0.025em] text-[var(--color-neutral-900)]">
                Features &amp; pricing
              </h1>
              <p className="mt-1.5 text-[14px] text-[var(--color-neutral-600)]">
                Everything Parisar sells. Grant or remove these per society from its detail panel.
              </p>
              <div className="mt-6 flex flex-col gap-2">
                {features.map((f) => (
                  <div
                    key={f.key}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-[var(--color-neutral-200)] bg-white p-4"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[15px] font-bold text-[var(--color-neutral-900)]">
                        {f.name}
                        {f.is_core ? (
                          <span className="rounded-full bg-[var(--color-brand-50)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-brand-700)]">
                            Core
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-neutral-600)]">
                        {f.description}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {f.is_core ? (
                        <span className="text-[15px] font-extrabold text-[var(--color-neutral-900)]">
                          Included
                        </span>
                      ) : priceEdit?.key === f.key ? (
                        <span className="flex items-center gap-1">
                          <span className="text-[15px] font-extrabold text-[var(--color-neutral-400)]">
                            ₹
                          </span>
                          <input
                            // biome-ignore lint/a11y/noAutofocus: opened on click
                            autoFocus
                            inputMode="numeric"
                            value={priceEdit.val}
                            onChange={(e) =>
                              setPriceEdit({
                                key: f.key,
                                val: e.target.value.replace(/\D/g, "").slice(0, 6),
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                saveListPrice(f.key, Number(priceEdit.val) || 0);
                              if (e.key === "Escape") setPriceEdit(null);
                            }}
                            className="h-9 w-20 rounded-lg border border-[var(--color-brand-500)] px-2 text-right text-[15px] font-extrabold tabular-nums outline-none"
                          />
                          <button
                            type="button"
                            aria-label="Save price"
                            onClick={() => saveListPrice(f.key, Number(priceEdit.val) || 0)}
                            className="pk-press rounded-md p-1.5 text-[var(--color-brand-600)] hover:bg-[var(--color-brand-50)]"
                          >
                            <Check size={16} strokeWidth={3} />
                          </button>
                        </span>
                      ) : isAdmin ? (
                        <button
                          type="button"
                          onClick={() => setPriceEdit({ key: f.key, val: String(f.price_monthly) })}
                          className="pk-press group/p flex items-center gap-1.5 rounded-lg px-2 py-1 text-[15px] font-extrabold tabular-nums text-[var(--color-neutral-900)] hover:bg-[var(--color-neutral-100)]"
                          title="Edit list price"
                        >
                          ₹{f.price_monthly}/mo
                          <Pencil
                            size={13}
                            strokeWidth={2.2}
                            aria-hidden="true"
                            className="text-[var(--color-neutral-400)] opacity-0 transition-opacity group-hover/p:opacity-100"
                          />
                        </button>
                      ) : (
                        <span className="text-[15px] font-extrabold tabular-nums text-[var(--color-neutral-900)]">
                          from ₹{f.price_monthly}/mo
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[12px] leading-relaxed text-[var(--color-neutral-400)]">
                {isAdmin
                  ? "Tap a price to set the floor — the minimum any society can be charged for that feature. Core features are always on and never billed."
                  : "These are floor prices set by admin. When you enable a feature for a society you can charge this or more, never less."}
              </p>
            </>
          ) : null}

          {/* ---------------- create ---------------- */}
          {section === "create" ? (
            <div>
              <h1 className="text-[24px] font-extrabold tracking-[-0.025em] text-[var(--color-neutral-900)]">
                Create society
              </h1>
              <p className="mt-1.5 text-[14px] text-[var(--color-neutral-600)]">
                The phone entered below becomes the chairman. They are elevated automatically the
                first time they sign in with the code.
              </p>

              <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start">
                <div className="rounded-2xl border border-[var(--color-neutral-200)] bg-white p-6 shadow-[0_1px_2px_rgba(18,38,28,.04)]">
                  {active ? (
                    <p className="mb-4 rounded-xl bg-[var(--color-brand-50)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--color-brand-700)]">
                      From request: {active.society_name} · {active.contact_name}
                    </p>
                  ) : null}

                  {created ? (
                    <div>
                      <p className="text-[13px] font-semibold text-[var(--color-neutral-600)]">
                        {created.society} is live. Read this out on the call:
                      </p>
                      <div
                        className="a-rise mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 px-5 py-5"
                        style={{
                          borderColor: "var(--color-brand-500)",
                          backgroundColor: "var(--color-brand-50)",
                        }}
                      >
                        <span className="font-mono text-[28px] font-extrabold tracking-[0.16em] text-[var(--color-neutral-900)]">
                          {created.code}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(created.code);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            } catch {
                              /* clipboard blocked — the code is on screen anyway */
                            }
                          }}
                          className="pk-press inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold"
                          style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
                        >
                          <Copy size={14} strokeWidth={2.4} />
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-neutral-600)]">
                        {created.chairman} becomes chairman on first sign-in with this code.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setCreated(null);
                          setActive(null);
                          setForm(EMPTY_FORM);
                        }}
                        className="mt-5 text-[13px] font-bold text-[var(--color-brand-600)] hover:underline"
                      >
                        Create another
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={createSociety} className="flex flex-col gap-4">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                          Society name
                        </span>
                        <input
                          className={input}
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          placeholder="Green Meadows CHS"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                          Street address
                        </span>
                        <input
                          className={input}
                          value={form.addressLine}
                          onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
                          placeholder="12 MG Road, Shivajinagar"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                          Landmark <span className="font-normal opacity-60">(optional)</span>
                        </span>
                        <input
                          className={input}
                          value={form.landmark}
                          onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                          placeholder="Opposite Cafe Goodluck"
                        />
                      </label>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                            City
                          </span>
                          <input
                            className={input}
                            value={form.city}
                            onChange={(e) => setForm({ ...form, city: e.target.value })}
                            placeholder="Pune"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                            State
                          </span>
                          <select
                            className={input}
                            value={form.state}
                            onChange={(e) => setForm({ ...form, state: e.target.value })}
                          >
                            <option value="">Select…</option>
                            {STATES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                            PIN code
                          </span>
                          <input
                            className={input}
                            inputMode="numeric"
                            maxLength={6}
                            value={form.pincode}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                pincode: e.target.value.replace(/\D/g, "").slice(0, 6),
                              })
                            }
                            placeholder="411005"
                          />
                        </label>
                      </div>

                      <div className="mt-1 border-t border-[var(--color-neutral-200)] pt-4">
                        <p className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--color-brand-600)]">
                          <Phone size={12} strokeWidth={2.6} aria-hidden="true" />
                          Chairman
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                              Name
                            </span>
                            <input
                              className={input}
                              value={form.secName}
                              onChange={(e) => setForm({ ...form, secName: e.target.value })}
                              placeholder="Ramesh Patil"
                            />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                              Mobile (10 digits)
                            </span>
                            <input
                              className={input}
                              inputMode="numeric"
                              maxLength={10}
                              value={form.secPhone}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  secPhone: e.target.value.replace(/\D/g, "").slice(0, 10),
                                })
                              }
                              placeholder="9812345678"
                            />
                          </label>
                        </div>
                      </div>

                      {err ? (
                        <p
                          role="alert"
                          className="rounded-xl px-3.5 py-2.5 text-[13px] font-medium"
                          style={{ backgroundColor: "#FCE9E6", color: "#94291A" }}
                        >
                          {err}
                        </p>
                      ) : null}

                      <button
                        type="submit"
                        disabled={busy}
                        className="pk-press mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                        style={{
                          backgroundColor: busy
                            ? "var(--color-neutral-200)"
                            : "var(--color-brand-500)",
                          color: busy ? "var(--color-neutral-400)" : "#fff",
                        }}
                      >
                        {busy ? (
                          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                        ) : null}
                        {busy ? "Creating…" : "Create society & generate code"}
                      </button>
                    </form>
                  )}
                </div>

                {/* Live preview — fills in as staff type, so the artifact they are
                  about to create is visible before they commit. */}
                <aside className="lg:sticky lg:top-8">
                  <div className="overflow-hidden rounded-2xl border border-[var(--color-neutral-200)] bg-white">
                    <div
                      className="flex items-center gap-2.5 px-5 py-4"
                      style={{ background: "linear-gradient(135deg, var(--color-brand-50), #fff)" }}
                    >
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-xl"
                        style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
                      >
                        <Building2 size={18} strokeWidth={2.2} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-extrabold tracking-[-0.01em] text-[var(--color-neutral-900)]">
                          {form.name.trim() || "New society"}
                        </p>
                        <p className="text-[12px] text-[var(--color-neutral-600)]">
                          {[form.city.trim(), form.state].filter(Boolean).join(", ") ||
                            "Location pending"}
                        </p>
                      </div>
                    </div>
                    <dl className="divide-y divide-[var(--color-neutral-200)] px-5 text-[13px]">
                      {[
                        [
                          "Address",
                          [form.addressLine, form.landmark].filter((x) => x.trim()).join(" · "),
                        ],
                        ["PIN", form.pincode],
                        ["Chairman", form.secName],
                        ["Chairman mobile", form.secPhone ? `+91 ${form.secPhone}` : ""],
                      ].map(([label, val]) => (
                        <div
                          key={label}
                          className="flex items-baseline justify-between gap-3 py-2.5"
                        >
                          <dt className="shrink-0 text-[var(--color-neutral-400)]">{label}</dt>
                          <dd
                            className="truncate text-right font-semibold"
                            style={{
                              color: val ? "var(--color-neutral-900)" : "var(--color-neutral-300)",
                            }}
                          >
                            {val || "—"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="border-t border-[var(--color-neutral-200)] px-5 py-3.5 text-[12px] leading-relaxed text-[var(--color-neutral-400)]">
                      A join code is generated on create — you read it out on the call.
                    </p>
                  </div>
                </aside>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      {/* ---------------- society detail drawer ---------------- */}
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close detail"
            onClick={() => setOpenId(null)}
            className="a-scrim fixed inset-0 z-40 bg-[rgba(18,38,28,.42)] backdrop-blur-[2px]"
          />
          <div className="a-drawer fixed right-0 top-0 z-50 h-full w-full max-w-[520px] border-l border-[var(--color-neutral-200)] bg-white shadow-2xl">
            <SocietyDetail
              societyId={open.id}
              onClose={() => setOpenId(null)}
              onChanged={refresh}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
