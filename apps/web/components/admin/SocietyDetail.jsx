"use client";

// One society, everything staff need during a call: who to ring, what they can
// use, what they owe, and what was said last time.
//
// Notes are internal. The society cannot read them (society_notes has no RLS
// policy for authenticated), which is the point — staff have to be able to
// write "chased twice, still unresponsive" without it becoming a customer-facing
// document.

// Each pane lives in ./society-detail/*; this file owns the data, the state and
// the RPC handlers.

import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AdminFeatureRequests } from "./insights/AdminFeatureRequests";
import { AdminHistory } from "./insights/AdminHistory";
import { AdminMonthly } from "./insights/AdminMonthly";
import { BillingPane } from "./society-detail/BillingPane";
import { ALL_PANES } from "./society-detail/constants";
import { FeaturesPane } from "./society-detail/FeaturesPane";
import { NotesPane } from "./society-detail/NotesPane";
import { OverviewPane } from "./society-detail/OverviewPane";
import { PaymentsPane } from "./society-detail/PaymentsPane";

export function SocietyDetail({ societyId, isAdmin = false, onClose, onChanged }) {
  // Billing & payments are admin-only. The RPC already omits that data for
  // sales; this hides the tabs so it is not even offered.
  const PANES = ALL_PANES.filter((p) => isAdmin || !p.adminOnly);
  const [pane, setPane] = useState("overview");
  const [pendingRequests, setPendingRequests] = useState(0);
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
      const { data: reqs } = await supabase.rpc("admin_society_feature_requests", {
        p_society_id: societyId,
      });
      if (alive && Array.isArray(reqs)) {
        setPendingRequests(reqs.filter((r) => r.status === "pending").length);
      }
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

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Tabs: wrap into rows on phones, a vertical list on wider screens — never scroll sideways. */}
        <nav className="flex shrink-0 flex-wrap gap-1 border-b border-[var(--color-neutral-200)] p-3 md:w-[210px] md:flex-col md:flex-nowrap md:overflow-y-auto md:border-b-0 md:border-r">
          {PANES.map(({ id, label, icon: Icon }) => {
            const on = pane === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPane(id)}
                aria-current={on ? "page" : undefined}
                className="pk-press inline-flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[14px] font-bold transition-colors hover:bg-[var(--color-neutral-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] md:w-full"
                style={{
                  backgroundColor: on ? "var(--color-brand-50)" : undefined,
                  color: on ? "var(--color-brand-700)" : "var(--color-neutral-600)",
                }}
              >
                <Icon size={14} strokeWidth={2.3} aria-hidden="true" />
                {label}
                {id === "requests" && pendingRequests > 0 ? (
                  <span className="ml-0.5 rounded-full bg-[#FDF0DF] px-1.5 text-[11px] tabular-nums text-[#8A4708]">
                    {pendingRequests}
                  </span>
                ) : null}
                {id === "notes" && notes.length > 0 ? (
                  <span className="ml-0.5 text-[11px] tabular-nums opacity-70">{notes.length}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-5 lg:p-7">
          {/* ---------------- overview ---------------- */}
          {pane === "overview" ? (
            <OverviewPane
              societyId={societyId}
              onChanged={onChanged}
              s={s}
              features={features}
              featureTotal={featureTotal}
              pendingRequests={pendingRequests}
              copied={copied}
              setCopied={setCopied}
              setPane={setPane}
            />
          ) : null}

          {/* ---------------- features ---------------- */}
          {pane === "features" ? (
            <FeaturesPane
              features={features}
              featureTotal={featureTotal}
              busy={busy}
              editKey={editKey}
              setEditKey={setEditKey}
              editVal={editVal}
              setEditVal={setEditVal}
              priceErr={priceErr}
              setPriceErr={setPriceErr}
              setSocietyPrice={setSocietyPrice}
              toggleFeature={toggleFeature}
            />
          ) : null}

          {/* ---------------- billing ---------------- */}
          {/* ---------------- requests / monthly / history ---------------- */}
          {pane === "requests" ? (
            <AdminFeatureRequests
              societyId={societyId}
              onCount={setPendingRequests}
              onChanged={() => reload(createSupabaseBrowserClient())}
            />
          ) : null}
          {pane === "monthly" ? <AdminMonthly societyId={societyId} /> : null}
          {pane === "history" ? <AdminHistory societyId={societyId} /> : null}

          {pane === "billing" ? (
            <BillingPane
              bill={bill}
              setBill={setBill}
              saveBilling={saveBilling}
              featureTotal={featureTotal}
              busy={busy}
              saved={saved}
            />
          ) : null}

          {/* ---------------- payments (manual ledger) ---------------- */}
          {pane === "payments" ? (
            <PaymentsPane
              payments={payments}
              totalCollected={totalCollected}
              pay={pay}
              setPay={setPay}
              payErr={payErr}
              busy={busy}
              recordPayment={recordPayment}
              deletePayment={deletePayment}
            />
          ) : null}

          {/* ---------------- notes ---------------- */}
          {pane === "notes" ? (
            <NotesPane notes={notes} note={note} setNote={setNote} busy={busy} addNote={addNote} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
