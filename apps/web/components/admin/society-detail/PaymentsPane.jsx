// Payments: a manual ledger of what a society paid us.

import { Loader2, Plus, Trash2 } from "lucide-react";
import { field } from "./constants";

export function PaymentsPane({
  payments,
  totalCollected,
  pay,
  setPay,
  payErr,
  busy,
  recordPayment,
  deletePayment,
}) {
  return (
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
            <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">Paid on</span>
            <input
              type="date"
              className={field}
              max={new Date().toISOString().slice(0, 10)}
              value={pay.paid_on}
              onChange={(e) => setPay({ ...pay, paid_on: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">Method</span>
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
        A manual record of what a society paid us — not a gateway. "Last paid" on the Billing tab is
        derived from the newest entry here.
      </p>
    </div>
  );
}
