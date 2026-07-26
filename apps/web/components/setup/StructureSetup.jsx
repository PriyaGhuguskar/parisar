"use client";

// Chairman's first-run society structure: wings + flats.
//
// This is the "pick from a pre-set list" prerequisite — residents can only
// choose their flat once the chairman has entered them here. Deliberately
// focused (just wings + flats), not the old multi-step wizard, because an
// admin-created society already has its name, address and code.
//
// A "single building" toggle covers societies with no wings: one hidden wing
// named "Main" so the data model stays uniform (a flat always belongs to a
// wing) without making the chairman invent a wing name.
//
// Everything is committed in ONE bootstrap_society_structure call, which is
// atomic — a half-created society (wings but no flats) never happens.

import { Building2, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { setPin as setPinAction } from "@/app/actions/codeLogin";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const field =
  "h-12 w-full rounded-xl border border-[var(--color-neutral-200)] bg-white px-3.5 text-[15px] outline-none transition-[border-color,box-shadow] focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]";

// "101, 102 103\n201" -> ["101","102","103","201"]
function parseFlats(text) {
  return text
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function StructureSetup({ societyId, initialName = "", phone = "", userId = null }) {
  const { t } = useTranslation("auth");
  const router = useRouter();

  const [stage, setStage] = useState("form"); // form | pin
  const [name, setName] = useState(initialName);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [single, setSingle] = useState(false);
  const [wings, setWings] = useState([{ name: "", flats: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const rows = single ? [wings[0]] : wings;

  function setRow(i, patch) {
    setWings((w) => w.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
    setErr(null);
  }

  const totalFlats = rows.reduce((n, r) => n + parseFlats(r.flats).length, 0);
  const wingCount = single ? 1 : rows.filter((r) => r.name.trim()).length;

  async function submit(e) {
    e.preventDefault();
    setErr(null);

    // Build the payload the RPC expects: wings[{name}], flats[{wing_name, number}].
    const wingPayload = [];
    const flatPayload = [];

    if (single) {
      const nums = parseFlats(wings[0].flats);
      if (nums.length === 0) return setErr(t("auth.structNeedFlats"));
      const name = t("auth.structSingleName");
      wingPayload.push({ name });
      for (const number of nums) flatPayload.push({ wing_name: name, number });
    } else {
      const named = rows.filter((r) => r.name.trim());
      if (named.length === 0) return setErr(t("auth.structNeedWing"));
      for (const r of named) {
        const name = r.name.trim();
        wingPayload.push({ name });
        for (const number of parseFlats(r.flats)) flatPayload.push({ wing_name: name, number });
      }
      if (flatPayload.length === 0) return setErr(t("auth.structNeedFlats"));
    }

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc("bootstrap_society_structure", {
        p_society_id: societyId,
        p_wings: wingPayload,
        p_flats: flatPayload,
      });
      if (error) {
        setErr(t("auth.structErr"));
        setBusy(false);
        return;
      }
      // Persist the (possibly corrected) chairman name. RLS scopes this to their
      // own profile row.
      if (name.trim() && name.trim() !== initialName) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user)
          await supabase.from("profiles").update({ full_name: name.trim() }).eq("user_id", user.id);
      }
      // PIN is the LAST step — advance to it now that setup is done.
      setStage("pin");
      setBusy(false);
    } catch {
      setErr(t("auth.structErr"));
      setBusy(false);
    }
  }

  async function savePin(e) {
    e.preventDefault();
    setErr(null);
    if (!/^\d{4}$/.test(pin) || pin === "1234" || /^(\d)\1{3}$/.test(pin)) {
      return setErr(t("auth.setPinWeak"));
    }
    if (pin !== pin2) return setErr(t("auth.setPinMismatch"));
    setBusy(true);
    const res = await setPinAction(userId, phone, pin);
    if (res?.error) {
      setErr(t("auth.structErr"));
      setBusy(false);
      return;
    }
    // Defensive re-mint: guarantees the JWT carries society_id/role before the
    // dashboard's RLS queries run, independent of the refresh done at claim time.
    await createSupabaseBrowserClient().auth.refreshSession();
    router.push("/dashboard");
  }

  // ---- final step: set the PIN ----
  if (stage === "pin") {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "var(--color-neutral-50)" }}>
        <div className="mx-auto w-full max-w-md px-5 py-10 sm:py-14">
          <span
            className="mb-6 inline-flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
          >
            <Building2 size={20} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <h1 className="text-[28px] font-extrabold leading-[1.12] tracking-[-0.03em] text-[var(--color-neutral-900)]">
            {t("auth.setPinTitle")}
          </h1>
          <p className="mt-2 text-[15px] text-[var(--color-neutral-600)]">{t("auth.setPinSub")}</p>
          <form onSubmit={savePin} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
                {t("auth.pinLabel")}
              </span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                placeholder="••••"
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className={`${field} h-14 text-center text-[24px] font-bold tracking-[0.5em]`}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
                {t("auth.setPinConfirm")}
              </span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin2}
                placeholder="••••"
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className={`${field} h-14 text-center text-[24px] font-bold tracking-[0.5em]`}
              />
            </label>
            {err ? (
              <p
                role="alert"
                className="rounded-xl px-3.5 py-2.5 text-[13px] font-medium"
                style={{ backgroundColor: "#FCE9E6", color: "#94291A" }}
              >
                {err}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || pin.length !== 4 || pin2.length !== 4}
              className="pk-press inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
              style={{
                backgroundColor: busy ? "var(--color-neutral-400)" : "var(--color-brand-500)",
              }}
            >
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              {t("auth.setPinSave")}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-neutral-50)" }}>
      <div className="mx-auto w-full max-w-xl px-5 py-10 sm:py-14">
        <span
          className="mb-6 inline-flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
        >
          <Building2 size={20} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <h1 className="text-[28px] font-extrabold leading-[1.12] tracking-[-0.03em] text-[var(--color-neutral-900)]">
          {t("auth.structTitle")}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--color-neutral-600)]">
          {t("auth.structSub")}
        </p>

        <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
              {t("auth.structYourName")}
            </span>
            <input
              className={`${field} h-12`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("auth.structYourName")}
            />
            <span className="text-[12px] text-[var(--color-neutral-400)]">
              {t("auth.structYourNameHint")}
            </span>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--color-neutral-200)] bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={single}
              onChange={(e) => setSingle(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-brand-500)]"
            />
            <span className="text-[14px] font-semibold text-[var(--color-neutral-900)]">
              {t("auth.structSingle")}
            </span>
          </label>

          {single ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
                {t("auth.structFlatsFor", { wing: t("auth.structSingleName") })}
              </span>
              <textarea
                value={wings[0].flats}
                onChange={(e) => setRow(0, { flats: e.target.value })}
                placeholder={t("auth.structFlatsPh")}
                rows={3}
                className={`${field} h-auto py-3`}
              />
              <span className="text-[12px] text-[var(--color-neutral-400)]">
                {t("auth.structFlatsHint")}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {rows.map((r, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional, no stable id
                  key={i}
                  className="rounded-2xl border border-[var(--color-neutral-200)] bg-white p-4"
                >
                  <div className="flex items-center gap-3">
                    <label className="flex flex-1 flex-col gap-1.5">
                      <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
                        {t("auth.structWingsLabel")}
                      </span>
                      <input
                        value={r.name}
                        onChange={(e) => setRow(i, { name: e.target.value })}
                        placeholder={t("auth.structWingPh")}
                        className={field}
                      />
                    </label>
                    {rows.length > 1 ? (
                      <button
                        type="button"
                        aria-label="Remove wing"
                        onClick={() => setWings((w) => w.filter((_, idx) => idx !== i))}
                        className="pk-press mt-6 rounded-lg p-2 text-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-100)]"
                      >
                        <X size={16} strokeWidth={2.4} />
                      </button>
                    ) : null}
                  </div>
                  <label className="mt-3 flex flex-col gap-1.5">
                    <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
                      {t("auth.structFlatsFor", { wing: r.name.trim() || t("auth.structWingPh") })}
                    </span>
                    <textarea
                      value={r.flats}
                      onChange={(e) => setRow(i, { flats: e.target.value })}
                      placeholder={t("auth.structFlatsPh")}
                      rows={2}
                      className={`${field} h-auto py-3`}
                    />
                  </label>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setWings((w) => [...w, { name: "", flats: "" }])}
                className="pk-press inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-neutral-200)] py-2.5 text-[14px] font-bold text-[var(--color-brand-600)] hover:border-[var(--color-brand-500)]"
              >
                <Plus size={16} strokeWidth={2.6} aria-hidden="true" />
                {t("auth.structWingAdd")}
              </button>
            </div>
          )}

          {err ? (
            <p
              role="alert"
              className="rounded-xl px-3.5 py-2.5 text-[13px] font-medium"
              style={{ backgroundColor: "#FCE9E6", color: "#94291A" }}
            >
              {err}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-[13px] font-semibold tabular-nums text-[var(--color-neutral-400)]">
              {t("auth.structReview", { wings: wingCount, flats: totalFlats })}
            </span>
            <button
              type="submit"
              disabled={busy}
              className="pk-press inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
              style={{
                backgroundColor: busy ? "var(--color-neutral-400)" : "var(--color-brand-500)",
              }}
            >
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              {busy ? t("auth.structSaving") : t("auth.obNext")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
