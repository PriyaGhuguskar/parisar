import { Loader2 } from "lucide-react";
import { field, PLANS, STATUSES } from "./constants";

export function BillingPane({ bill, setBill, saveBilling, featureTotal, busy, saved }) {
  return (
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
          <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">Status</span>
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
          <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">Next due</span>
          <input
            type="date"
            className={field}
            value={bill.next_due_on ?? ""}
            onChange={(e) => setBill({ ...bill, next_due_on: e.target.value })}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">Last paid</span>
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
          Enabled add-ons total ₹{featureTotal.toLocaleString("en-IN")} but the agreed amount is ₹
          {Number(bill.monthly_amount || 0).toLocaleString("en-IN")}. Fine if it is a negotiated
          rate — worth a look if not.
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
  );
}
