"use client";

// AdminAuthorities — staff view of a society's Society Authorities (replaces the
// single "Chairman" row). Staff can add authorities at any time and fix details;
// once an authority has signed in, their mobile is locked (their account is tied
// to it) but the name stays editable. Backed by admin_society_authorities,
// admin_add_society_authority and admin_update_society_authority.

import { Loader2, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const field =
  "h-10 w-full rounded-xl border border-[var(--color-neutral-200)] bg-white px-3 text-[14px] outline-none focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]";

const PHONE_RE = /^[6-9]\d{9}$/;

function messageFor(error) {
  const m = error?.message ?? "";
  if (m.includes("AUTHORITY_ALREADY_CLAIMED"))
    return "This authority has already signed in, so their number can't be changed. You can still fix the name.";
  if (m.includes("ALREADY_AUTHORITY"))
    return "That number is already an authority of this society.";
  if (m.includes("INVALID_NAME")) return "Enter a name (at least 2 letters).";
  if (m.includes("INVALID_PHONE")) return "Enter a valid 10-digit mobile.";
  return "Could not save. Check your connection.";
}

function AuthorityForm({ initial, phoneLocked, busy, error, onSubmit, onCancel, submitLabel }) {
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [localErr, setLocalErr] = useState(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim().length < 2) return setLocalErr("Enter a name (at least 2 letters).");
        if (!PHONE_RE.test(phone)) return setLocalErr("Enter a valid 10-digit mobile.");
        setLocalErr(null);
        onSubmit({ name: name.trim(), phone });
      }}
      className="flex flex-col gap-2 pt-1"
    >
      <input
        className={field}
        value={name}
        placeholder="Name"
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-semibold text-[var(--color-neutral-600)]">+91</span>
        <input
          className={field}
          inputMode="numeric"
          maxLength={10}
          value={phone}
          disabled={phoneLocked}
          placeholder="9812345678"
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
        />
      </div>
      {phoneLocked ? (
        <span className="text-[12px] text-[var(--color-neutral-400)]">
          Signed in — number is locked, name can still be fixed.
        </span>
      ) : null}
      {localErr || error ? (
        <span className="text-[12px] font-medium" style={{ color: "#C0341B" }} role="alert">
          {localErr || error}
        </span>
      ) : null}
      <div className="flex gap-2 pt-0.5">
        <button
          type="submit"
          disabled={busy}
          className="pk-press inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold text-white"
          style={{ backgroundColor: "var(--color-brand-500)" }}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="pk-press rounded-lg px-3 text-[13px] font-semibold text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AdminAuthorities({ societyId, onChanged }) {
  const [rows, setRows] = useState(null);
  const [loadErr, setLoadErr] = useState(false);
  const [editing, setEditing] = useState(null); // authority id | "new" | null
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("admin_society_authorities", {
      p_society_id: societyId,
    });
    if (error) {
      setLoadErr(true);
      return;
    }
    setLoadErr(false);
    setRows(Array.isArray(data) ? data : []);
  }, [societyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(fn, params) {
    setBusy(true);
    setErr(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.rpc(fn, params);
    setBusy(false);
    if (error) {
      setErr(messageFor(error));
      return;
    }
    setEditing(null);
    await load();
    onChanged?.();
  }

  if (loadErr) {
    return <span className="text-[13px] text-[#C0341B]">Couldn't load authorities.</span>;
  }
  if (!rows) return <Loader2 size={14} className="animate-spin text-[var(--color-neutral-400)]" />;

  return (
    <div className="flex flex-col gap-2" data-testid="admin-authorities">
      {rows.length === 0 ? (
        <span className="text-[13px] text-[var(--color-neutral-400)]">No authorities yet.</span>
      ) : null}
      {rows.map((a) =>
        editing === a.id ? (
          <AuthorityForm
            key={a.id}
            initial={{ name: a.full_name, phone: a.phone }}
            phoneLocked={a.claimed}
            busy={busy}
            error={err}
            submitLabel="Save"
            onCancel={() => {
              setEditing(null);
              setErr(null);
            }}
            onSubmit={({ name, phone }) =>
              save("admin_update_society_authority", {
                p_authority_id: a.id,
                p_name: name,
                p_phone: phone,
              })
            }
          />
        ) : (
          <span key={a.id} className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--color-neutral-900)]">{a.full_name}</span>
            <a
              href={`tel:+91${a.phone}`}
              className="font-semibold text-[var(--color-brand-600)] hover:underline"
            >
              +91 {a.phone}
            </a>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={
                a.claimed
                  ? { backgroundColor: "var(--color-brand-50)", color: "var(--color-brand-700)" }
                  : {
                      backgroundColor: "var(--color-neutral-100)",
                      color: "var(--color-neutral-600)",
                    }
              }
            >
              {a.claimed ? "Signed in" : "Not signed in yet"}
            </span>
            <button
              type="button"
              onClick={() => {
                setErr(null);
                setEditing(a.id);
              }}
              aria-label={`Edit ${a.full_name}`}
              className="pk-press rounded-md p-1 text-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-100)]"
            >
              <Pencil size={13} strokeWidth={2.2} />
            </button>
          </span>
        ),
      )}
      {editing === "new" ? (
        <AuthorityForm
          initial={{ name: "", phone: "" }}
          phoneLocked={false}
          busy={busy}
          error={err}
          submitLabel="Add"
          onCancel={() => {
            setEditing(null);
            setErr(null);
          }}
          onSubmit={({ name, phone }) =>
            save("admin_add_society_authority", {
              p_society_id: societyId,
              p_name: name,
              p_phone: phone,
            })
          }
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setErr(null);
            setEditing("new");
          }}
          className="pk-press inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-[13px] font-bold text-[var(--color-brand-600)] hover:bg-[var(--color-brand-50)]"
        >
          <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
          Add authority
        </button>
      )}
    </div>
  );
}
