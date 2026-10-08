"use client";

// Staff "History" tab: one dated timeline of everything that happened to a
// society — creation, authorities, features and requests, billing, payments,
// setup and members, and (filterable) day-to-day resident activity.
// Source: admin_society_history (audit_log).

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { categoryOf, describeEvent, HISTORY_CATEGORIES, isVisible } from "./historyLabels";

function dayLabel(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function AdminHistory({ societyId }) {
  const [events, setEvents] = useState(null);
  const [loadErr, setLoadErr] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await createSupabaseBrowserClient().rpc("admin_society_history", {
        p_society_id: societyId,
      });
      if (!alive) return;
      if (error) setLoadErr(true);
      else setEvents((Array.isArray(data) ? data : []).filter(isVisible));
    })();
    return () => {
      alive = false;
    };
  }, [societyId]);

  const days = useMemo(() => {
    const shown = (events ?? []).filter((e) => filter === "all" || categoryOf(e.action) === filter);
    const groups = [];
    for (const e of shown) {
      const label = dayLabel(e.at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(e);
      else groups.push({ label, items: [e] });
    }
    return groups;
  }, [events, filter]);

  if (loadErr) return <p className="text-[13px] text-[#C0341B]">Couldn't load history.</p>;
  if (!events)
    return <Loader2 size={16} className="animate-spin text-[var(--color-neutral-400)]" />;

  return (
    <div className="flex flex-col gap-4" data-testid="admin-history">
      <div className="flex flex-wrap gap-1.5">
        {HISTORY_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilter(c.id)}
            className="pk-press rounded-full border px-2.5 py-1 text-[12px] font-bold"
            style={
              filter === c.id
                ? {
                    backgroundColor: "var(--color-brand-500)",
                    borderColor: "var(--color-brand-500)",
                    color: "#fff",
                  }
                : { borderColor: "var(--color-neutral-200)", color: "var(--color-neutral-600)" }
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {days.length === 0 ? (
        <p className="text-[13px] text-[var(--color-neutral-600)]">Nothing recorded here yet.</p>
      ) : (
        days.map((d) => (
          <section key={d.label}>
            <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-neutral-400)]">
              {d.label}
            </h3>
            <ol className="flex flex-col border-l-2 border-[var(--color-neutral-200)] pl-3">
              {d.items.map((e) => {
                const { title, detail } = describeEvent(e);
                return (
                  <li key={e.id} className="py-1.5" data-testid="admin-history-event">
                    <p className="text-[13px] font-semibold text-[var(--color-neutral-900)]">
                      {title}
                    </p>
                    <p className="text-[12px] text-[var(--color-neutral-600)]">
                      {new Date(e.at).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {e.actor_name ? ` · ${e.actor_name}` : ""}
                      {detail ? ` · ${detail}` : ""}
                    </p>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}
