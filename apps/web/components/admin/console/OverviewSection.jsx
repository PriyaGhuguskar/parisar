import { Building2, Inbox, IndianRupee, TriangleAlert, Users, Zap } from "lucide-react";
import { fmtWhen } from "./constants";

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

export function OverviewSection({ stats, leads, startFromLead }) {
  return (
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
        <Stat icon={TriangleAlert} value={stats.past_due ?? 0} label="Past due" tone="danger" />
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
  );
}
