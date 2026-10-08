"use client";

// Staff "Requests" tab: what a society's authorities asked to add or remove.
// Pending requests first, with Approve (switches the feature via
// admin_set_feature, keeping any negotiated price) / Decline + an optional note.

import { Check, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const STATUS_STYLE = {
  pending: { bg: "#FDF0DF", fg: "#8A4708", label: "Pending" },
  approved: { bg: "var(--color-brand-50)", fg: "var(--color-brand-700)", label: "Approved" },
  declined: { bg: "#FCE9E6", fg: "#94291A", label: "Declined" },
};

function fmt(ts) {
  return new Date(ts).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminFeatureRequests({ societyId, onChanged, onCount }) {
  const [rows, setRows] = useState(null);
  const [loadErr, setLoadErr] = useState(false);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await createSupabaseBrowserClient().rpc(
      "admin_society_feature_requests",
      { p_society_id: societyId },
    );
    if (error) {
      setLoadErr(true);
      return;
    }
    const list = Array.isArray(data) ? data : [];
    setLoadErr(false);
    setRows(list);
    onCount?.(list.filter((r) => r.status === "pending").length);
  }, [societyId, onCount]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id, approve) {
    setBusy(id);
    setErr(null);
    const { error } = await createSupabaseBrowserClient().rpc("admin_decide_feature_request", {
      p_request_id: id,
      p_approve: approve,
      p_note: notes[id]?.trim() || null,
    });
    setBusy(null);
    if (error) {
      setErr(
        error.message.includes("ALREADY_DECIDED")
          ? "Someone already decided this request."
          : error.message.includes("PRICE_BELOW_FLOOR")
            ? "The society's saved price is below the list price — fix it in Features first."
            : "Could not save. Check your connection.",
      );
      return;
    }
    await load();
    onChanged?.();
  }

  if (loadErr) return <p className="text-[13px] text-[#C0341B]">Couldn't load requests.</p>;
  if (!rows) return <Loader2 size={16} className="animate-spin text-[var(--color-neutral-400)]" />;
  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-[var(--color-neutral-600)]">
        No requests yet. Society authorities can ask to add or remove features from their Society
        Dashboard.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="admin-feature-requests">
      {err ? (
        <p role="alert" className="text-[13px] font-medium text-[#C0341B]">
          {err}
        </p>
      ) : null}
      {rows.map((r) => {
        const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending;
        return (
          <div
            key={r.id}
            className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-3.5"
            data-testid="admin-feature-request"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase"
                style={{
                  backgroundColor: r.action === "add" ? "var(--color-brand-50)" : "#F3F4F6",
                  color: r.action === "add" ? "var(--color-brand-700)" : "var(--color-neutral-600)",
                }}
              >
                {r.action === "add" ? "Add" : "Remove"}
              </span>
              <span className="text-[14px] font-bold text-[var(--color-neutral-900)]">
                {r.feature_name}
              </span>
              <span className="text-[12px] text-[var(--color-neutral-400)]">
                ₹{Number(r.list_price ?? 0).toLocaleString("en-IN")}/mo list
              </span>
              <span
                className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ backgroundColor: st.bg, color: st.fg }}
              >
                {st.label}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] text-[var(--color-neutral-600)]">
              {r.requested_by_name ?? "An authority"} · {fmt(r.created_at)}
            </p>
            {r.note ? (
              <p className="mt-1 text-[13px] text-[var(--color-neutral-900)]">“{r.note}”</p>
            ) : null}
            {r.status === "pending" ? (
              <div className="mt-3 flex flex-col gap-2">
                <input
                  className="h-9 w-full rounded-lg border border-[var(--color-neutral-200)] px-3 text-[13px] outline-none focus:border-[var(--color-brand-500)]"
                  placeholder="Note for the record (optional)"
                  maxLength={300}
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => decide(r.id, true)}
                    className="pk-press inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold text-white disabled:opacity-60"
                    style={{ backgroundColor: "var(--color-brand-500)" }}
                  >
                    {busy === r.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Check size={13} strokeWidth={2.6} />
                    )}
                    Approve {r.action === "add" ? "& turn on" : "& turn off"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => decide(r.id, false)}
                    className="pk-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-neutral-200)] px-3 text-[13px] font-semibold text-[var(--color-neutral-600)] disabled:opacity-60"
                  >
                    <X size={13} strokeWidth={2.6} />
                    Decline
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-1.5 text-[12px] text-[var(--color-neutral-400)]">
                {st.label}
                {r.decided_by_name ? ` by ${r.decided_by_name}` : ""}
                {r.decided_at ? ` · ${fmt(r.decided_at)}` : ""}
                {r.decision_note ? ` — “${r.decision_note}”` : ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
