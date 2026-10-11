import { Copy, Loader2, Phone, Plus, X } from "lucide-react";
import { CreatePreview } from "./CreatePreview";
import { EMPTY_FORM, input, STATES } from "./constants";

export function CreateSocietySection({
  active,
  setActive,
  created,
  setCreated,
  copied,
  setCopied,
  form,
  setForm,
  err,
  busy,
  createSociety,
}) {
  return (
    <div>
      <h1 className="text-[24px] font-extrabold tracking-[-0.025em] text-[var(--color-neutral-900)]">
        Create society
      </h1>
      <p className="mt-1.5 text-[14px] text-[var(--color-neutral-600)]">
        Add everyone who will manage this society as a Society Authority. Each signs in with their
        own mobile: the first one sets up wings and flats, and every authority then joins as a
        resident and gets the Society Dashboard.
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="rounded-2xl border border-[var(--color-neutral-200)] bg-white p-6 shadow-[0_1px_2px_rgba(18,38,28,.04)]">
          {active ? (
            <p className="mb-4 rounded-xl bg-[var(--color-brand-50)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--color-brand-700)]">
              From request: {active.society_name} · {active.contact_name}
            </p>
          ) : null}

          {created ? (
            <div>
              <p className="text-[13px] font-semibold text-[var(--color-neutral-600)]">
                {created.society} is live. Read this out on the call:
              </p>
              <div
                className="a-rise mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 px-5 py-5"
                style={{
                  borderColor: "var(--color-brand-500)",
                  backgroundColor: "var(--color-brand-50)",
                }}
              >
                <span className="font-mono text-[28px] font-extrabold tracking-[0.16em] text-[var(--color-neutral-900)]">
                  {created.code}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(created.code);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      /* clipboard blocked — the code is on screen anyway */
                    }
                  }}
                  className="pk-press inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold"
                  style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
                >
                  <Copy size={14} strokeWidth={2.4} />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-neutral-600)]">
                Authorities ({created.authorities}) get the Society Dashboard when they sign in with
                their own mobile. Share this code with residents.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCreated(null);
                  setActive(null);
                  setForm(EMPTY_FORM);
                }}
                className="mt-5 text-[13px] font-bold text-[var(--color-brand-600)] hover:underline"
              >
                Create another
              </button>
            </div>
          ) : (
            <form onSubmit={createSociety} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                  Society name
                </span>
                <input
                  className={input}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Green Meadows CHS"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                  Street address
                </span>
                <input
                  className={input}
                  value={form.addressLine}
                  onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
                  placeholder="12 MG Road, Shivajinagar"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                  Landmark <span className="font-normal opacity-60">(optional)</span>
                </span>
                <input
                  className={input}
                  value={form.landmark}
                  onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                  placeholder="Opposite Cafe Goodluck"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                    City
                  </span>
                  <input
                    className={input}
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="Pune"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                    State
                  </span>
                  <select
                    className={input}
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                  >
                    <option value="">Select…</option>
                    {STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                    PIN code
                  </span>
                  <input
                    className={input}
                    inputMode="numeric"
                    maxLength={6}
                    value={form.pincode}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        pincode: e.target.value.replace(/\D/g, "").slice(0, 6),
                      })
                    }
                    placeholder="411005"
                  />
                </label>
              </div>

              <div className="mt-1 border-t border-[var(--color-neutral-200)] pt-4">
                <p className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--color-brand-600)]">
                  <Phone size={12} strokeWidth={2.6} aria-hidden="true" />
                  Society Authorities
                </p>
                <div className="flex flex-col gap-3">
                  {form.authorities.map((a, i) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: editable rows with no id until saved
                      key={i}
                      className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
                      data-testid="authority-row"
                    >
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                          Name
                        </span>
                        <input
                          className={input}
                          value={a.name}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              authorities: form.authorities.map((row, j) =>
                                j === i ? { ...row, name: e.target.value } : row,
                              ),
                            })
                          }
                          placeholder="Ramesh Patil"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">
                          Mobile (10 digits)
                        </span>
                        <input
                          className={input}
                          inputMode="numeric"
                          maxLength={10}
                          value={a.phone}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              authorities: form.authorities.map((row, j) =>
                                j === i
                                  ? {
                                      ...row,
                                      phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                                    }
                                  : row,
                              ),
                            })
                          }
                          placeholder="9812345678"
                        />
                      </label>
                      {form.authorities.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              authorities: form.authorities.filter((_, j) => j !== i),
                            })
                          }
                          aria-label={`Remove authority ${i + 1}`}
                          className="mb-1 rounded-lg p-2 text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-100)]"
                        >
                          <X size={16} strokeWidth={2.4} aria-hidden="true" />
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        authorities: [...form.authorities, { name: "", phone: "" }],
                      })
                    }
                    className="pk-press inline-flex items-center justify-center gap-1.5 self-start rounded-xl border border-dashed border-[var(--color-neutral-300)] px-3.5 py-2 text-[13px] font-bold text-[var(--color-brand-600)] hover:border-[var(--color-brand-500)]"
                  >
                    <Plus size={14} strokeWidth={2.6} aria-hidden="true" />
                    Add authority
                  </button>
                </div>
              </div>

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
                disabled={busy}
                className="pk-press mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{
                  backgroundColor: busy ? "var(--color-neutral-200)" : "var(--color-brand-500)",
                  color: busy ? "var(--color-neutral-400)" : "#fff",
                }}
              >
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                {busy ? "Creating…" : "Create society & generate code"}
              </button>
            </form>
          )}
        </div>

        <CreatePreview form={form} />
      </div>
    </div>
  );
}
