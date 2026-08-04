"use client";

// New-resident onboarding after OTP: society code -> your details (pick your
// flat) -> family -> PIN. Four steps, one atomic commit each side.
//
// The resident is already OTP-verified (they arrived here in `code` mode), so
// they have a session but no membership yet. onboard_flats_for_code lets them
// see the chairman's flats despite not being a member; onboard_resident joins
// them, names them and pre-registers their family in one call; then setPin.
//
// Family phones entered here become a login path — those people later sign in
// with OTP + a PIN, no code, no re-onboarding (claim_family_membership).

import { ArrowLeft, Building2, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { setPin as setPinAction } from "@/app/actions/codeLogin";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const field =
  "h-12 w-full rounded-xl border border-[var(--color-neutral-200)] bg-white px-3.5 text-[15px] outline-none transition-[border-color,box-shadow] focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]";

function weakPin(p) {
  return p === "1234" || /^(\d)\1{3}$/.test(p);
}

export function OnboardingWizard({ phone, userId, initialName = "" }) {
  const { t } = useTranslation("auth");
  const router = useRouter();

  // The number they signed in with — always known, shown read-only so it's clear
  // which mobile they're registered under (the "Alternate" below is a backup).
  const phoneDisplay = phone ? `+91 ${phone.replace(/\D/g, "").slice(-10)}` : "";

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const [code, setCode] = useState("");
  const [society, setSociety] = useState(null); // { society_id, society_name, wings }
  const [form, setForm] = useState({ name: initialName, flatId: "", residency: "owner", alt: "" });
  const [family, setFamily] = useState([]);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");

  // --- step 1: code ------------------------------------------------------
  async function onCode(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const norm = code.toUpperCase().replace(/\s/g, "");
      const withDash = norm.includes("-") ? norm : `${norm.slice(0, 4)}-${norm.slice(4)}`;
      const { data } = await supabase.rpc("onboard_flats_for_code", { p_code: withDash });
      if (!data || data.error) {
        setErr(t("auth.obCodeInvalid"));
        setBusy(false);
        return;
      }
      setSociety({ ...data, code: withDash });
      setStep(2);
      setBusy(false);
    } catch {
      setErr(t("auth.obErr"));
      setBusy(false);
    }
  }

  function onDetails(e) {
    e.preventDefault();
    setErr(null);
    if (form.name.trim().length < 2) return setErr(t("auth.obNeedName"));
    if (!form.flatId) return setErr(t("auth.obNeedFlat"));
    setStep(3);
  }

  function addFamily() {
    setFamily((f) => [...f, { name: "", relation: "", phone: "" }]);
  }
  function setFam(i, patch) {
    setFamily((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  // --- step 4: pin -> commit everything ----------------------------------
  async function onFinish(e) {
    e.preventDefault();
    setErr(null);
    if (!/^\d{4}$/.test(pin)) return setErr(t("auth.setPinWeak"));
    if (weakPin(pin)) return setErr(t("auth.setPinWeak"));
    if (pin !== pin2) return setErr(t("auth.setPinMismatch"));
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("onboard_resident", {
        p_code: society.code,
        p_flat_id: form.flatId,
        p_full_name: form.name.trim(),
        p_residency: form.residency,
        p_alt_phone: form.alt.trim() || null,
        p_family: family
          .filter((m) => m.name.trim())
          .map((m) => ({
            name: m.name.trim(),
            relation: m.relation.trim(),
            phone: m.phone.trim() || null,
            is_resident: true,
          })),
      });
      if (error || data?.error) {
        setErr(t("auth.obErr"));
        setBusy(false);
        return;
      }
      const res = await setPinAction(userId, phone, pin);
      if (res?.error) {
        setErr(t("auth.obErr"));
        setBusy(false);
        return;
      }
      // Onboarding just created the membership — after this session's JWT was
      // minted at verifyOtp. Re-mint so the Auth Hook injects society_id/role;
      // otherwise the dashboard's RLS queries run against an empty society claim.
      await createSupabaseBrowserClient().auth.refreshSession();
      // pending_review members still land in the app; the dashboard shows their
      // status. No need to block them on a separate screen.
      router.push("/dashboard");
    } catch {
      setErr(t("auth.obErr"));
      setBusy(false);
    }
  }

  const flats = (society?.wings ?? []).flatMap((w) => w.flats.map((f) => ({ ...f, wing: w.name })));

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-neutral-50)" }}>
      <div className="mx-auto w-full max-w-lg px-5 py-10 sm:py-14">
        <div className="mb-6 flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
          >
            <Building2 size={19} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <span className="text-[13px] font-bold tabular-nums text-[var(--color-neutral-400)]">
            {t("auth.obStep", { n: step })}
          </span>
        </div>

        {/* progress bar */}
        <div className="mb-8 flex gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className="h-1.5 flex-1 rounded-full transition-colors"
              style={{
                backgroundColor: n <= step ? "var(--color-brand-500)" : "var(--color-neutral-200)",
              }}
            />
          ))}
        </div>

        {/* ---- step 1: code ---- */}
        {step === 1 ? (
          <form onSubmit={onCode} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-[var(--color-neutral-900)]">
                {t("auth.obCodeTitle")}
              </h1>
              <p className="text-[15px] text-[var(--color-neutral-600)]">{t("auth.obCodeSub")}</p>
            </div>
            <input
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9-]/g, "")
                    .slice(0, 9),
                )
              }
              placeholder="ABCD-1234"
              autoCapitalize="characters"
              className="h-14 w-full rounded-2xl border border-[var(--color-neutral-200)] bg-white px-4 text-center text-[20px] font-bold uppercase tracking-[0.2em] outline-none focus:border-[var(--color-brand-500)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_18%,transparent)]"
              style={{ borderColor: err ? "var(--color-danger-500)" : undefined }}
            />
            {err ? <Err msg={err} /> : null}
            <Primary
              busy={busy}
              disabled={code.replace("-", "").length !== 8}
              label={t("auth.obNext")}
            />
          </form>
        ) : null}

        {/* ---- step 2: details ---- */}
        {step === 2 ? (
          <form onSubmit={onDetails} className="flex flex-col gap-5">
            <Head
              back={() => setStep(1)}
              title={t("auth.obDetailsTitle")}
              sub={t("auth.obDetailsSub", { society: society?.society_name ?? "" })}
            />
            <Label text={t("auth.obYourMobile")}>
              <input
                className={field}
                value={phoneDisplay}
                readOnly
                disabled
                style={{
                  backgroundColor: "var(--color-neutral-50)",
                  color: "var(--color-neutral-600)",
                }}
              />
            </Label>
            <Label text={t("auth.obName")}>
              <input
                className={field}
                value={form.name}
                placeholder={t("auth.obNamePh")}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Label>
            <Label text={t("auth.obFlat")}>
              <select
                className={field}
                value={form.flatId}
                onChange={(e) => setForm({ ...form, flatId: e.target.value })}
              >
                <option value="">{t("auth.obFlatPick")}</option>
                {flats.map((f) => (
                  <option key={f.id} value={f.id} disabled={f.taken}>
                    {f.wing === "Main" ? f.number : `${f.wing}-${f.number}`}
                    {f.taken ? ` (${t("auth.obFlatTaken")})` : ""}
                  </option>
                ))}
              </select>
            </Label>
            <Label text={t("auth.obResidency")}>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["owner", t("auth.obOwner")],
                  ["tenant", t("auth.obTenant")],
                ].map(([v, lbl]) => {
                  const on = form.residency === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setForm({ ...form, residency: v })}
                      className="rounded-xl border px-4 py-3 text-[14px] font-bold transition-colors"
                      style={{
                        borderColor: on ? "var(--color-brand-500)" : "var(--color-neutral-200)",
                        backgroundColor: on ? "var(--color-brand-50)" : "#fff",
                        color: on ? "var(--color-brand-700)" : "var(--color-neutral-600)",
                      }}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </Label>
            <Label text={t("auth.obAlt")} hint={t("auth.obAltHint")}>
              <input
                className={field}
                inputMode="numeric"
                maxLength={10}
                value={form.alt}
                placeholder="98765 43210"
                onChange={(e) =>
                  setForm({ ...form, alt: e.target.value.replace(/\D/g, "").slice(0, 10) })
                }
              />
            </Label>
            {err ? <Err msg={err} /> : null}
            <Primary label={t("auth.obNext")} />
          </form>
        ) : null}

        {/* ---- step 3: family ---- */}
        {step === 3 ? (
          <div className="flex flex-col gap-5">
            <Head
              back={() => setStep(2)}
              title={t("auth.obFamilyTitle")}
              sub={t("auth.obFamilySub")}
            />
            <div className="flex flex-col gap-3">
              {family.map((m, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: positional rows, no id
                <div
                  key={i}
                  className="rounded-2xl border border-[var(--color-neutral-200)] bg-white p-3.5"
                >
                  <div className="flex items-center gap-2">
                    <input
                      className={field}
                      value={m.name}
                      placeholder={t("auth.obFamilyName")}
                      onChange={(e) => setFam(i, { name: e.target.value })}
                    />
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => setFamily((f) => f.filter((_, idx) => idx !== i))}
                      className="pk-press rounded-lg p-2 text-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-100)]"
                    >
                      <X size={16} strokeWidth={2.4} />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      className={field}
                      value={m.relation}
                      placeholder={t("auth.obFamilyRelPh")}
                      onChange={(e) => setFam(i, { relation: e.target.value })}
                    />
                    <input
                      className={field}
                      inputMode="numeric"
                      maxLength={10}
                      value={m.phone}
                      placeholder={t("auth.obFamilyPhone")}
                      onChange={(e) =>
                        setFam(i, { phone: e.target.value.replace(/\D/g, "").slice(0, 10) })
                      }
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addFamily}
                className="pk-press inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-neutral-200)] py-2.5 text-[14px] font-bold text-[var(--color-brand-600)] hover:border-[var(--color-brand-500)]"
              >
                <Plus size={16} strokeWidth={2.6} aria-hidden="true" />
                {family.length === 0 ? t("auth.obFamilyName") : t("auth.obFamilyAdd")}
              </button>
            </div>
            <Primary label={t("auth.obNext")} onClick={() => setStep(4)} type="button" />
            <button
              type="button"
              onClick={() => setStep(4)}
              className="text-center text-[13px] font-semibold text-[var(--color-neutral-500)] hover:underline"
            >
              {t("auth.obFamilyNone")}
            </button>
          </div>
        ) : null}

        {/* ---- step 4: pin ---- */}
        {step === 4 ? (
          <form onSubmit={onFinish} className="flex flex-col gap-5">
            <Head back={() => setStep(3)} title={t("auth.setPinTitle")} sub={t("auth.setPinSub")} />
            <Label text={t("auth.pinLabel")}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                placeholder="••••"
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className={`${field} h-14 text-center text-[24px] font-bold tracking-[0.5em]`}
              />
            </Label>
            <Label text={t("auth.setPinConfirm")}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin2}
                placeholder="••••"
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className={`${field} h-14 text-center text-[24px] font-bold tracking-[0.5em]`}
              />
            </Label>
            {err ? <Err msg={err} /> : null}
            <Primary
              busy={busy}
              disabled={pin.length !== 4 || pin2.length !== 4}
              label={t("auth.obFinish")}
            />
          </form>
        ) : null}
      </div>
    </div>
  );
}

function Head({ back, title, sub }) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={back}
        className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-[var(--color-neutral-500)] hover:underline"
      >
        <ArrowLeft size={14} strokeWidth={2.4} aria-hidden="true" />
        Back
      </button>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-[var(--color-neutral-900)]">
        {title}
      </h1>
      <p className="text-[15px] text-[var(--color-neutral-600)]">{sub}</p>
    </div>
  );
}
function Label({ text, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">{text}</span>
      {children}
      {hint ? <span className="text-[12px] text-[var(--color-neutral-400)]">{hint}</span> : null}
    </label>
  );
}
function Err({ msg }) {
  return (
    <p
      role="alert"
      className="rounded-xl px-3.5 py-2.5 text-[13px] font-medium"
      style={{ backgroundColor: "#FCE9E6", color: "#94291A" }}
    >
      {msg}
    </p>
  );
}
function Primary({ busy, disabled, label, onClick, type = "submit" }) {
  return (
    <button
      type={type}
      disabled={busy || disabled}
      onClick={onClick}
      className="pk-press inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
      style={{
        backgroundColor: busy || disabled ? "var(--color-neutral-300)" : "var(--color-brand-500)",
      }}
    >
      {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
      {label}
    </button>
  );
}
