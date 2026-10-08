"use client";

// Staff "Monthly" tab: for every month since the society was created, the paid
// features that were on (end of month, or today for the current month), what
// each cost this society, the month's fee, and what was switched that month.
// Source: admin_society_monthly (reconstructed from the feature audit trail).

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function rupees(n) {
  return `₹${Number(n ?? 0).toLocaleString("en-IN")}`;
}

export function AdminMonthly({ societyId }) {
  const [months, setMonths] = useState(null);
  const [loadErr, setLoadErr] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await createSupabaseBrowserClient().rpc("admin_society_monthly", {
        p_society_id: societyId,
      });
      if (!alive) return;
      if (error) setLoadErr(true);
      else setMonths(Array.isArray(data) ? [...data].reverse() : []);
    })();
    return () => {
      alive = false;
    };
  }, [societyId]);

  if (loadErr) return <p className="text-[13px] text-[#C0341B]">Couldn't load monthly history.</p>;
  if (!months)
    return <Loader2 size={16} className="animate-spin text-[var(--color-neutral-400)]" />;

  const total = months.reduce((a, m) => a + (m.fee ?? 0), 0);

  return (
    <div className="flex flex-col gap-3" data-testid="admin-monthly">
      <p className="text-[12px] text-[var(--color-neutral-600)]">
        Paid add-ons active at each month's end (core features are free). Fee uses this society's
        price where one was set. Total across {months.length} month
        {months.length === 1 ? "" : "s"}: <span className="font-bold">{rupees(total)}</span>
      </p>
      {months.map((m) => (
        <div
          key={m.month}
          className="rounded-xl border bg-white p-3.5"
          style={{
            borderColor: m.is_current ? "var(--color-brand-500)" : "var(--color-neutral-200)",
          }}
          data-testid="admin-month"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[14px] font-bold text-[var(--color-neutral-900)]">
              {monthLabel(m.month)}
              {m.is_current ? (
                <span className="ml-2 text-[11px] font-bold uppercase text-[var(--color-brand-600)]">
                  This month
                </span>
              ) : null}
            </span>
            <span className="text-[15px] font-extrabold tabular-nums text-[var(--color-neutral-900)]">
              {rupees(m.fee)}/mo
            </span>
          </div>
          {m.features.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {m.features.map((f) => (
                <li
                  key={f.key}
                  className="rounded-full bg-[var(--color-brand-50)] px-2 py-0.5 text-[12px] font-semibold text-[var(--color-brand-700)]"
                >
                  {f.name} · {rupees(f.price)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[12px] text-[var(--color-neutral-400)]">
              No paid add-ons — core features only.
            </p>
          )}
          {m.changes.length ? (
            <ul className="mt-2 flex flex-col gap-0.5">
              {m.changes.map((c) => (
                <li
                  key={`${c.key}-${c.at}`}
                  className="text-[12px] text-[var(--color-neutral-600)]"
                >
                  {new Date(c.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  {" — "}
                  {c.name ?? c.key} turned {c.enabled ? "ON" : "OFF"}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}
