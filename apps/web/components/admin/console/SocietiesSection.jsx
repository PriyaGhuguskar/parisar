import { ChevronRight } from "lucide-react";

export function SocietiesSection({ societies, setOpenId }) {
  return (
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
                <p className="flex items-center gap-2 truncate text-[15px] font-bold text-[var(--color-neutral-900)]">
                  <span className="truncate">{s.name}</span>
                  {s.service_status && s.service_status !== "active" ? (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase"
                      style={
                        s.service_status === "blocked"
                          ? { backgroundColor: "#FCE9E6", color: "#94291A" }
                          : { backgroundColor: "#FDF0DF", color: "#8A4708" }
                      }
                    >
                      {s.service_status === "blocked" ? "Blocked" : "Service stopped"}
                    </span>
                  ) : null}
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
  );
}
