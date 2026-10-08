"use client";

// AdminService — the society's service status on the staff society page.
//   Stop service (paused): members see a "Service paused" screen with the reason.
//   Block: same, and the society code stops working (no new residents).
//   Resume: back to normal. Everything is kept; all changes go into History.
// Only platform admins can change it (admin_set_society_service enforces this;
// sales see the status read-only).

import { Ban, Loader2, PauseCircle, PlayCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const STATUS = {
  active: { label: "Active", bg: "var(--color-brand-50)", fg: "var(--color-brand-700)" },
  paused: { label: "Service stopped", bg: "#FDF0DF", fg: "#8A4708" },
  blocked: { label: "Blocked", bg: "#FCE9E6", fg: "#94291A" },
};

const ACTIONS = {
  paused: {
    title: "Stop service",
    help: "Residents and guards can still log in, but they only see this reason until you resume service.",
    confirm: "Stop service",
    color: "#B45309",
  },
  blocked: {
    title: "Block society",
    help: "Residents and guards only see this reason, and the society code stops working — nobody new can join. You can unblock later; no data is deleted.",
    confirm: "Block society",
    color: "#B42318",
  },
  active: {
    title: "Resume service",
    help: "Everyone gets full access again and the reason is cleared.",
    confirm: "Resume service",
    color: "var(--color-brand-500)",
  },
};

function messageFor(error) {
  const m = error?.message ?? "";
  if (m.includes("REASON_REQUIRED"))
    return "Write a reason (at least 5 characters) — the society will see it.";
  if (m.includes("REASON_TOO_LONG")) return "Keep the reason under 500 characters.";
  if (m.includes("NOT_PLATFORM_ADMIN")) return "Only a platform admin can change this.";
  return "Could not save. Check your connection.";
}

export function AdminService({ societyId, onChanged }) {
  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState(false);
  const [action, setAction] = useState(null); // 'paused' | 'blocked' | 'active' | null
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await createSupabaseBrowserClient().rpc("admin_society_service", {
      p_society_id: societyId,
    });
    if (error) {
      setLoadErr(true);
      return;
    }
    setLoadErr(false);
    setInfo(data);
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    if (action !== "active" && reason.trim().length < 5) {
      setErr("Write a reason (at least 5 characters) — the society will see it.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await createSupabaseBrowserClient().rpc("admin_set_society_service", {
      p_society_id: societyId,
      p_status: action,
      p_reason: action === "active" ? null : reason.trim(),
    });
    setBusy(false);
    if (error) {
      setErr(messageFor(error));
      return;
    }
    setAction(null);
    setReason("");
    await load();
    onChanged?.();
  }

  if (loadErr) return <span className="text-[13px] text-[#C0341B]">Couldn't load status.</span>;
  if (!info) return <Loader2 size={14} className="animate-spin text-[var(--color-neutral-400)]" />;

  const st = STATUS[info.status] ?? STATUS.active;
  const choices =
    info.status === "active"
      ? ["paused", "blocked"]
      : info.status === "paused"
        ? ["active", "blocked"]
        : ["active"];
  const icons = { paused: PauseCircle, blocked: Ban, active: PlayCircle };

  return (
    <div className="flex flex-col gap-2" data-testid="admin-service">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[12px] font-bold"
          style={{ backgroundColor: st.bg, color: st.fg }}
        >
          {st.label}
        </span>
        {info.changed_at && info.status !== "active" ? (
          <span className="text-[12px] text-[var(--color-neutral-400)]">
            since{" "}
            {new Date(info.changed_at).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {info.changed_by_name ? ` · by ${info.changed_by_name}` : ""}
          </span>
        ) : null}
      </div>
      {info.reason ? (
        <p className="rounded-lg bg-[var(--color-neutral-50)] px-3 py-2 text-[13px] text-[var(--color-neutral-900)]">
          “{info.reason}”
        </p>
      ) : null}

      {info.can_change ? (
        action ? (
          <form
            onSubmit={submit}
            className="flex flex-col gap-2 rounded-xl border border-[var(--color-neutral-200)] p-3"
          >
            <p className="text-[14px] font-bold text-[var(--color-neutral-900)]">
              {ACTIONS[action].title}
            </p>
            <p className="text-[12px] text-[var(--color-neutral-600)]">{ACTIONS[action].help}</p>
            {action !== "active" ? (
              <textarea
                // biome-ignore lint/a11y/noAutofocus: opened by an explicit admin action
                autoFocus
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason shown to the society, e.g. Monthly fee unpaid since August — please contact Parisar."
                className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-brand-500)]"
              />
            ) : null}
            {err ? (
              <p role="alert" className="text-[12px] font-medium text-[#C0341B]">
                {err}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="pk-press inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold text-white disabled:opacity-60"
                style={{ backgroundColor: ACTIONS[action].color }}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : null}
                {ACTIONS[action].confirm}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAction(null);
                  setErr(null);
                }}
                className="pk-press rounded-lg px-3 text-[13px] font-semibold text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)]"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {choices.map((c) => {
              const Icon = icons[c];
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setErr(null);
                    setReason(c === "active" ? "" : (info.reason ?? ""));
                    setAction(c);
                  }}
                  className="pk-press inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-bold"
                  style={{ borderColor: "var(--color-neutral-200)", color: ACTIONS[c].color }}
                >
                  <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
                  {ACTIONS[c].title}
                </button>
              );
            })}
          </div>
        )
      ) : (
        <span className="text-[12px] text-[var(--color-neutral-400)]">
          Only a platform admin can stop or block a society.
        </span>
      )}
    </div>
  );
}
