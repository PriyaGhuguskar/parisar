import { Clock, Phone, Zap } from "lucide-react";
import { fmtWhen } from "./constants";

export function SocietyRequestsSection({ leads, startFromLead }) {
  return (
    <>
      <h1 className="text-[24px] font-extrabold tracking-[-0.025em] text-[var(--color-neutral-900)]">
        Society requests
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
  );
}
