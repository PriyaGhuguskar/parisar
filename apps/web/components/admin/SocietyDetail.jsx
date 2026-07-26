"use client";

// One society, everything staff need during a call: who to ring, what they can
// use, what they owe, and what was said last time.
//
// Notes are internal. The society cannot read them (society_notes has no RLS
// policy for authenticated), which is the point — staff have to be able to
// write "chased twice, still unresponsive" without it becoming a customer-facing
// document.

import {
  Building2,
  Check,
  Copy,
  CreditCard,
  IndianRupee,
  Loader2,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const ALL_PANES = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "features", label: "Features", icon: Check },
  { id: "billing", label: "Billing", icon: CreditCard, adminOnly: true },
  { id: "payments", label: "Payments", icon: IndianRupee, adminOnly: true },
  { id: "notes", label: "Notes", icon: MessageSquare },
];

const PLANS = ["sprout", "neighbourhood", "township"];
const STATUSES = ["trial", "active", "past_due", "cancelled"];

const STATUS_TONE = {
  active: { bg: "var(--color-brand-50)", fg: "var(--color-brand-700)" },
  trial: { bg: "#E7F0FB", fg: "#1F5FA0" },
  past_due: { bg: "#FCE9E6", fg: "#94291A" },
  cancelled: { bg: "var(--color-neutral-100)", fg: "var(--color-neutral-600)" },
};

const field =
  "h-11 w-full rounded-xl border border-[var(--color-neutral-200)] bg-white px-3 text-[14px] outline-none focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]";

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon
        size={15}
        strokeWidth={2.2}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-[var(--color-neutral-400)]"
      />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-[var(--color-neutral-400)]">{label}</p>
        <div className="mt-0.5 text-[14px] text-[var(--color-neutral-900)]">{children}</div>
      </div>
    </div>
  );
}

export function SocietyDetail({ societyId, isAdmin = false, onClose, onChanged }) {
  // Billing & payments are admin-only. The RPC already omits that data for
  // sales; this hides the tabs so it is not even offered.
  const PANES = ALL_PANES.filter((p) => isAdmin || !p.adminOnly);
  const [pane, setPane] = useState("overview");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [bill, setBill] = useState(null);
  const [saved, setSaved] = useState(false);
  const [editKey, setEditKey] = useState(null); // feature key being priced
  const [editVal, setEditVal] = useState("");
  const [priceErr, setPriceErr] = useState(null);
  const [pay, setPay] = useState({ amount: "", paid_on: "", method: "upi", reference: "" });
  const [payErr, setPayErr] = useState(null);
  const [editChair, setEditChair] = useState(false);
  const [chair, setChair] = useState({ name: "", phone: "" });
  const [chairErr, setChairErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: d } = await supabase.rpc("admin_society_detail", { p_society_id: societyId });
      if (!alive) return;
      setData(d);
      setBill(
        d?.billing ?? { plan: "sprout", status: "trial", monthly_amount: 0, next_due_on: null },
      );
    })();
    return () => {
      alive = false;
    };
  }, [societyId]);

  async function reload(supabase) {
    const { data: d } = await supabase.rpc("admin_society_detail", { p_society_id: societyId });
    setData(d);
    if (d?.billing) setBill(d.billing);
    onChanged?.();
  }

  async function toggleFeature(key, next, priceOverride) {
    setBusy(key);
    const supabase = createSupabaseBrowserClient();
    await supabase.rpc("admin_set_feature", {
      p_society_id: societyId,
      p_feature_key: key,
      p_enabled: next,
      // Preserve any negotiated rate when merely flipping the switch.
      p_price_override: priceOverride ?? null,
    });
    await reload(supabase);
    setBusy(null);
  }

  // Set this society's price for one feature. A price below the feature's floor
  // (the admin list price) is refused by the RPC; we also block it here so the
  // user gets an inline message instead of a round trip.
  async function setSocietyPrice(key, price) {
    const feature = features.find((f) => f.key === key);
    const floor = feature?.floor ?? feature?.list_price ?? 0;
    if (price < floor) {
      setPriceErr(`Minimum is ₹${floor} for this feature.`);
      return;
    }
    setBusy(key);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.rpc("admin_set_feature", {
      p_society_id: societyId,
      p_feature_key: key,
      p_enabled: feature?.enabled ?? true,
      p_price_override: price,
    });
    if (error) {
      setPriceErr(
        error.message.includes("PRICE_BELOW_FLOOR")
          ? `Minimum is ₹${floor} for this feature.`
          : "Could not save the price.",
      );
      setBusy(null);
      return;
    }
    await reload(supabase);
    setBusy(null);
    setEditKey(null);
    setPriceErr(null);
  }

  async function saveBilling(e) {
    e.preventDefault();
    setBusy("billing");
    const supabase = createSupabaseBrowserClient();
    await supabase.rpc("admin_set_billing", {
      p_society_id: societyId,
      p_plan: bill.plan,
      p_status: bill.status,
      p_amount: Number(bill.monthly_amount) || 0,
      p_next_due: bill.next_due_on || null,
      p_last_paid: bill.last_paid_on || null,
      p_notes: bill.notes || null,
    });
    await reload(supabase);
    setBusy(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function addNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy("note");
    const supabase = createSupabaseBrowserClient();
    await supabase.rpc("admin_add_note", { p_society_id: societyId, p_body: note.trim() });
    setNote("");
    await reload(supabase);
    setBusy(null);
  }

  async function recordPayment(e) {
    e.preventDefault();
    setPayErr(null);
    const amount = Number(pay.amount);
    if (!amount || amount <= 0) return setPayErr("Enter an amount.");
    if (!pay.paid_on) return setPayErr("Pick the date it was paid.");
    setBusy("pay");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.rpc("admin_record_payment", {
      p_society_id: societyId,
      p_amount: amount,
      p_paid_on: pay.paid_on,
      p_method: pay.method,
      p_reference: pay.reference.trim() || null,
      p_note: null,
    });
    if (error) {
      setPayErr(error.message.replace(/_/g, " ").toLowerCase());
      setBusy(null);
      return;
    }
    setPay({ amount: "", paid_on: "", method: "upi", reference: "" });
    await reload(supabase);
    setBusy(null);
  }

  async function deletePayment(id) {
    setBusy("pay");
    const supabase = createSupabaseBrowserClient();
    await supabase.rpc("admin_delete_payment", { p_payment_id: id });
    await reload(supabase);
    setBusy(null);
  }

  function openChairEdit() {
    setChair({ name: s.secretary_name ?? "", phone: s.secretary_phone ?? "" });
    setChairErr(null);
    setEditChair(true);
  }
  async function saveChair(e) {
    e.preventDefault();
    setChairErr(null);
    if (chair.name.trim().length < 2) return setChairErr("Enter the chairman's name.");
    if (!/^[6-9]\d{9}$/.test(chair.phone)) return setChairErr("Enter a valid 10-digit mobile.");
    setBusy("chair");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.rpc("admin_update_chairman", {
      p_society_id: societyId,
      p_name: chair.name.trim(),
      p_phone: chair.phone,
    });
    if (error) {
      setChairErr(
        error.message.includes("CHAIRMAN_ALREADY_CLAIMED")
          ? "This chairman has already signed in, so their number can't be changed here. You can still fix the name."
          : "Could not save. Check your connection.",
      );
      setBusy(null);
      return;
    }
    await reload(supabase);
    setEditChair(false);
    setBusy(null);
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <Loader2 size={20} className="animate-spin text-[var(--color-neutral-400)]" />
      </div>
    );
  }

  const s = data.society ?? {};
  const features = data.features ?? [];
  const notes = data.notes ?? [];
  const payments = data.payments ?? [];
  const totalCollected = data.total_collected ?? 0;
  // What this society would be billed if every enabled add-on were charged —
  // shown next to the agreed amount so a mismatch is obvious.
  const featureTotal = features
    .filter((f) => f.enabled && !f.is_core)
    .reduce((a, f) => a + (f.price ?? f.list_price ?? 0), 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-neutral-200)] p-5">
        <div className="min-w-0">
          <h2 className="truncate text-[19px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
            {s.name}
          </h2>
          <p className="mt-1 text-[13px] text-[var(--color-neutral-600)]">
            {[s.city, s.state].filter(Boolean).join(", ") || "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="pk-press rounded-lg p-1.5 text-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
        >
          <X size={18} strokeWidth={2.4} />
        </button>
      </div>

      <div className="flex gap-1 border-b border-[var(--color-neutral-200)] px-4 pt-3">
        {PANES.map(({ id, label, icon: Icon }) => {
          const on = pane === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPane(id)}
              className="pk-press -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
              style={{
                borderColor: on ? "var(--color-brand-500)" : "transparent",
                color: on ? "var(--color-brand-700)" : "var(--color-neutral-600)",
              }}
            >
              <Icon size={14} strokeWidth={2.3} aria-hidden="true" />
              {label}
              {id === "notes" && notes.length > 0 ? (
                <span className="ml-0.5 text-[11px] tabular-nums opacity-70">{notes.length}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* ---------------- overview ---------------- */}
        {pane === "overview" ? (
          <div className="divide-y divide-[var(--color-neutral-200)]">
            <Row icon={MapPin} label="Address">
              {s.address ?? "—"}
              {s.landmark ? (
                <span className="block text-[13px] text-[var(--color-neutral-600)]">
                  Landmark: {s.landmark}
                </span>
              ) : null}
            </Row>
            <Row icon={Phone} label="Chairman">
              {editChair ? (
                <form onSubmit={saveChair} className="flex flex-col gap-2 pt-1">
                  <input
                    className={field}
                    value={chair.name}
                    placeholder="Chairman name"
                    onChange={(e) => setChair({ ...chair, name: e.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[var(--color-neutral-600)]">
                      +91
                    </span>
                    <input
                      className={field}
                      inputMode="numeric"
                      maxLength={10}
                      value={chair.phone}
                      disabled={Boolean(s.chairman_claimed)}
                      placeholder="9812345678"
                      onChange={(e) =>
                        setChair({
                          ...chair,
                          phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                        })
                      }
                    />
                  </div>
                  {s.chairman_claimed ? (
                    <span className="text-[12px] text-[var(--color-neutral-400)]">
                      Chairman has signed in — number is locked, name can still be fixed.
                    </span>
                  ) : null}
                  {chairErr ? (
                    <span className="text-[12px] font-medium" style={{ color: "#C0341B" }}>
                      {chairErr}
                    </span>
                  ) : null}
                  <div className="flex gap-2 pt-0.5">
                    <button
                      type="submit"
                      disabled={busy === "chair"}
                      className="pk-press inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold text-white"
                      style={{ backgroundColor: "var(--color-brand-500)" }}
                    >
                      {busy === "chair" ? <Loader2 size={13} className="animate-spin" /> : null}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditChair(false)}
                      className="pk-press rounded-lg px-3 text-[13px] font-semibold text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <span className="flex items-center gap-2">
                  <span>
                    {s.secretary_name ? (
                      <span className="font-semibold text-[var(--color-neutral-900)]">
                        {s.secretary_name}
                      </span>
                    ) : null}
                    <a
                      href={`tel:+91${s.secretary_phone}`}
                      className={`font-semibold text-[var(--color-brand-600)] hover:underline ${s.secretary_name ? "ml-2" : ""}`}
                    >
                      +91 {s.secretary_phone}
                    </a>
                  </span>
                  <button
                    type="button"
                    onClick={openChairEdit}
                    aria-label="Edit chairman"
                    className="pk-press rounded-md p-1 text-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-100)]"
                  >
                    <Pencil size={13} strokeWidth={2.2} />
                  </button>
                </span>
              )}
            </Row>
            <Row icon={Building2} label="Join code">
              <span className="inline-flex items-center gap-2">
                <span className="font-mono text-[15px] font-bold tracking-[0.1em]">
                  {s.code ?? "—"}
                </span>
                {s.code ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(s.code);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1800);
                      } catch {
                        /* clipboard blocked — the code is on screen anyway */
                      }
                    }}
                    className="pk-press rounded-md p-1 text-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-100)]"
                    aria-label="Copy join code"
                  >
                    {copied ? (
                      <Check size={13} strokeWidth={3} className="text-[var(--color-brand-600)]" />
                    ) : (
                      <Copy size={13} strokeWidth={2.4} />
                    )}
                  </button>
                ) : null}
              </span>
            </Row>
            <Row icon={Users} label="Residents">
              <span className="tabular-nums font-semibold">{s.member_count}</span> active
              {Number(s.pending_count) > 0 ? (
                <span className="ml-2 rounded-full bg-[#FDF0DF] px-2 py-0.5 text-[12px] font-bold text-[#8A4708]">
                  {s.pending_count} pending approval
                </span>
              ) : null}
            </Row>
            <Row icon={MessageSquare} label="Created">
              {new Date(s.created_at).toLocaleString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Row>
          </div>
        ) : null}

        {/* ---------------- features ---------------- */}
        {pane === "features" ? (
          <div>
            <div className="mb-4 flex items-center justify-between rounded-xl bg-[var(--color-neutral-50)] px-4 py-3">
              <span className="text-[13px] text-[var(--color-neutral-600)]">Add-ons enabled</span>
              <span className="text-[15px] font-extrabold tabular-nums text-[var(--color-neutral-900)]">
                ₹{featureTotal.toLocaleString("en-IN")}/mo
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {features.map((f) => (
                <div
                  key={f.key}
                  className="flex items-start justify-between gap-4 rounded-xl border border-[var(--color-neutral-200)] bg-white p-3.5"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[14px] font-bold text-[var(--color-neutral-900)]">
                      {f.name}
                      {f.is_core ? (
                        <span className="rounded-full bg-[var(--color-brand-50)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-brand-700)]">
                          Core
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-neutral-600)]">
                      {f.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {f.is_core ? (
                      <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
                        Included
                      </span>
                    ) : editKey === f.key ? (
                      <span className="flex flex-col items-end gap-1">
                        <span className="flex items-center gap-1">
                          <span className="text-[13px] font-bold text-[var(--color-neutral-400)]">
                            ₹
                          </span>
                          <input
                            // biome-ignore lint/a11y/noAutofocus: intentional — the field opened on click
                            autoFocus
                            inputMode="numeric"
                            value={editVal}
                            onChange={(e) => {
                              setEditVal(e.target.value.replace(/\D/g, "").slice(0, 6));
                              setPriceErr(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") setSocietyPrice(f.key, Number(editVal) || 0);
                              if (e.key === "Escape") {
                                setEditKey(null);
                                setPriceErr(null);
                              }
                            }}
                            className="h-8 w-16 rounded-lg border border-[var(--color-brand-500)] px-2 text-right text-[13px] font-bold tabular-nums outline-none"
                          />
                          <button
                            type="button"
                            aria-label="Save price"
                            onClick={() => setSocietyPrice(f.key, Number(editVal) || 0)}
                            className="pk-press rounded-md p-1 text-[var(--color-brand-600)] hover:bg-[var(--color-brand-50)]"
                          >
                            <Check size={14} strokeWidth={3} />
                          </button>
                        </span>
                        <span
                          className="text-[11px] font-medium"
                          style={{
                            color: priceErr ? "#C0341B" : "var(--color-neutral-400)",
                          }}
                        >
                          {priceErr ?? `Min ₹${f.floor ?? f.list_price}`}
                        </span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditKey(f.key);
                          setEditVal(String(f.price ?? f.list_price ?? 0));
                          setPriceErr(null);
                        }}
                        className="pk-press group/price flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-bold tabular-nums text-[var(--color-neutral-900)] hover:bg-[var(--color-neutral-100)]"
                        title="Set this society's price"
                      >
                        ₹{f.price ?? f.list_price}
                        {f.price_override != null &&
                        f.price_override > (f.floor ?? f.list_price) ? (
                          <span className="text-[10px] font-normal text-[var(--color-neutral-400)]">
                            floor ₹{f.floor ?? f.list_price}
                          </span>
                        ) : null}
                        <Pencil
                          size={11}
                          strokeWidth={2.2}
                          aria-hidden="true"
                          className="text-[var(--color-neutral-400)] opacity-0 transition-opacity group-hover/price:opacity-100"
                        />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={f.is_core || busy === f.key}
                      onClick={() => toggleFeature(f.key, !f.enabled, f.price_override)}
                      role="switch"
                      aria-checked={f.enabled}
                      aria-label={`${f.name} ${f.enabled ? "enabled" : "disabled"}`}
                      className="pk-press relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                      style={{
                        backgroundColor: f.enabled
                          ? "var(--color-brand-500)"
                          : "var(--color-neutral-200)",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[left] duration-200"
                        style={{ left: f.enabled ? "22px" : "2px" }}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-neutral-400)]">
              Tap a price to set this society's rate. The catalogue price is the floor — you can
              charge that or more, never less. Core features cannot be switched off — a society
              without a notice board is a support ticket, not a saving.
            </p>
          </div>
        ) : null}

        {/* ---------------- billing ---------------- */}
        {pane === "billing" ? (
          <form onSubmit={saveBilling} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">Plan</span>
                <select
                  className={field}
                  value={bill.plan ?? "sprout"}
                  onChange={(e) => setBill({ ...bill, plan: e.target.value })}
                >
                  {PLANS.map((p) => (
                    <option key={p} value={p}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                  Status
                </span>
                <select
                  className={field}
                  value={bill.status ?? "trial"}
                  onChange={(e) => setBill({ ...bill, status: e.target.value })}
                >
                  {STATUSES.map((p) => (
                    <option key={p} value={p}>
                      {p.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                  Monthly amount (₹)
                </span>
                <input
                  className={field}
                  inputMode="numeric"
                  value={bill.monthly_amount ?? 0}
                  onChange={(e) =>
                    setBill({ ...bill, monthly_amount: e.target.value.replace(/\D/g, "") })
                  }
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                  Next due
                </span>
                <input
                  type="date"
                  className={field}
                  value={bill.next_due_on ?? ""}
                  onChange={(e) => setBill({ ...bill, next_due_on: e.target.value })}
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                  Last paid
                </span>
                <p className="flex h-11 items-center px-1 text-[14px] font-semibold tabular-nums text-[var(--color-neutral-900)]">
                  {bill.last_paid_on
                    ? new Date(bill.last_paid_on).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                  <span className="ml-2 text-[11px] font-normal text-[var(--color-neutral-400)]">
                    from ledger
                  </span>
                </p>
              </div>
            </div>

            {featureTotal !== Number(bill.monthly_amount) ? (
              <p className="rounded-xl bg-[#FDF0DF] px-3.5 py-2.5 text-[13px] text-[#8A4708]">
                Enabled add-ons total ₹{featureTotal.toLocaleString("en-IN")} but the agreed amount
                is ₹{Number(bill.monthly_amount || 0).toLocaleString("en-IN")}. Fine if it is a
                negotiated rate — worth a look if not.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy === "billing"}
              className="pk-press inline-flex h-11 items-center justify-center gap-2 rounded-xl text-[14px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
              style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
            >
              {busy === "billing" ? <Loader2 size={15} className="animate-spin" /> : null}
              {saved ? "Saved" : "Save billing"}
            </button>
            <p className="text-[12px] leading-relaxed text-[var(--color-neutral-400)]">
              This is a record of what was agreed, not a payment gateway. Parisar never touches a
              society's or a resident's money.
            </p>
          </form>
        ) : null}

        {/* ---------------- payments (manual ledger) ---------------- */}
        {pane === "payments" ? (
          <div>
            <div className="mb-4 flex items-center justify-between rounded-xl bg-[var(--color-neutral-50)] px-4 py-3">
              <span className="text-[13px] text-[var(--color-neutral-600)]">Total collected</span>
              <span className="text-[17px] font-extrabold tabular-nums text-[var(--color-neutral-900)]">
                ₹{Number(totalCollected).toLocaleString("en-IN")}
              </span>
            </div>

            <form
              onSubmit={recordPayment}
              className="rounded-xl border border-[var(--color-neutral-200)] p-4"
            >
              <p className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--color-brand-600)]">
                <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
                Record a payment
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                    Amount (₹)
                  </span>
                  <input
                    className={field}
                    inputMode="numeric"
                    placeholder="1499"
                    value={pay.amount}
                    onChange={(e) =>
                      setPay({ ...pay, amount: e.target.value.replace(/\D/g, "").slice(0, 7) })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                    Paid on
                  </span>
                  <input
                    type="date"
                    className={field}
                    max={new Date().toISOString().slice(0, 10)}
                    value={pay.paid_on}
                    onChange={(e) => setPay({ ...pay, paid_on: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                    Method
                  </span>
                  <select
                    className={field}
                    value={pay.method}
                    onChange={(e) => setPay({ ...pay, method: e.target.value })}
                  >
                    {["upi", "bank_transfer", "cash", "cheque", "card", "other"].map((m) => (
                      <option key={m} value={m}>
                        {m.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                    Reference <span className="font-normal opacity-60">(optional)</span>
                  </span>
                  <input
                    className={field}
                    placeholder="UPI ref / cheque no"
                    value={pay.reference}
                    onChange={(e) => setPay({ ...pay, reference: e.target.value.slice(0, 120) })}
                  />
                </label>
              </div>
              {payErr ? (
                <p
                  role="alert"
                  className="mt-3 rounded-lg px-3 py-2 text-[13px] font-medium"
                  style={{ backgroundColor: "#FCE9E6", color: "#94291A" }}
                >
                  {payErr}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={busy === "pay"}
                className="pk-press mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-[14px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
                style={{ backgroundColor: "var(--color-brand-500)" }}
              >
                {busy === "pay" ? <Loader2 size={15} className="animate-spin" /> : null}
                Record payment
              </button>
            </form>

            <div className="mt-5 flex flex-col gap-2">
              {payments.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-[var(--color-neutral-400)]">
                  No payments recorded yet.
                </p>
              ) : (
                payments.map((p) => (
                  <div
                    key={p.id}
                    className="group/pay flex items-center justify-between gap-3 rounded-xl border border-[var(--color-neutral-200)] bg-white p-3.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[15px] font-extrabold tabular-nums text-[var(--color-neutral-900)]">
                        ₹{Number(p.amount).toLocaleString("en-IN")}
                        <span className="ml-2 rounded-full bg-[var(--color-neutral-100)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--color-neutral-600)]">
                          {p.method.replace("_", " ")}
                        </span>
                      </p>
                      <p className="mt-1 text-[12.5px] text-[var(--color-neutral-500)]">
                        {new Date(p.paid_on).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deletePayment(p.id)}
                      aria-label="Delete payment"
                      className="pk-press shrink-0 rounded-lg p-2 text-[var(--color-neutral-400)] opacity-0 transition-opacity hover:bg-[#FCE9E6] hover:text-[#94291A] focus-visible:opacity-100 group-hover/pay:opacity-100"
                    >
                      <Trash2 size={15} strokeWidth={2.2} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-[var(--color-neutral-400)]">
              A manual record of what a society paid us — not a gateway. "Last paid" on the Billing
              tab is derived from the newest entry here.
            </p>
          </div>
        ) : null}

        {/* ---------------- notes ---------------- */}
        {pane === "notes" ? (
          <div>
            <form onSubmit={addNote} className="flex gap-2">
              <input
                className={field}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What happened on the call?"
                maxLength={2000}
              />
              <button
                type="submit"
                disabled={!note.trim() || busy === "note"}
                aria-label="Add note"
                className="pk-press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2 disabled:opacity-45"
                style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
              >
                {busy === "note" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} strokeWidth={2.4} />
                )}
              </button>
            </form>

            <div className="mt-5 flex flex-col gap-3">
              {notes.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-[var(--color-neutral-400)]">
                  No notes yet. Anything recorded here stays internal — the society cannot read it.
                </p>
              ) : (
                notes.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-3.5"
                  >
                    <p className="text-[14px] leading-relaxed text-[var(--color-neutral-900)]">
                      {n.body}
                    </p>
                    <p className="mt-2 text-[12px] text-[var(--color-neutral-400)]">
                      {new Date(n.created_at).toLocaleString(undefined, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
