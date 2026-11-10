import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";

const MAX_PRICE = 999999;

/** Inline list-price editor: amount, Save, Cancel, and the server's error. */
function PriceEditor({ feature, priceEdit, setPriceEdit, saveListPrice }) {
  const [saving, setSaving] = useState(false);
  const empty = priceEdit.val === "";

  async function save() {
    if (empty || saving) return;
    setSaving(true);
    const error = await saveListPrice(feature.key, Number(priceEdit.val));
    setSaving(false);
    if (error) setPriceEdit({ ...priceEdit, error });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1">
        <span className="text-[15px] font-extrabold text-[var(--color-neutral-400)]">₹</span>
        <input
          // biome-ignore lint/a11y/noAutofocus: opened by the Edit button
          autoFocus
          inputMode="numeric"
          aria-label={`New monthly price for ${feature.name}, in rupees`}
          aria-invalid={Boolean(priceEdit.error) || empty}
          value={priceEdit.val}
          disabled={saving}
          onChange={(e) =>
            setPriceEdit({
              key: feature.key,
              val: e.target.value.replace(/\D/g, "").slice(0, String(MAX_PRICE).length),
              error: null,
            })
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setPriceEdit(null);
          }}
          className="h-9 w-24 rounded-lg border border-[var(--color-brand-500)] px-2 text-right text-[15px] font-extrabold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
        />
        <span className="text-[13px] font-semibold text-[var(--color-neutral-500)]">/mo</span>
        <button
          type="button"
          onClick={save}
          disabled={empty || saving}
          className="pk-press ml-1 inline-flex min-h-9 items-center gap-1 rounded-lg bg-[var(--color-brand-600)] px-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          <Check size={14} strokeWidth={3} aria-hidden="true" />
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setPriceEdit(null)}
          disabled={saving}
          className="pk-press inline-flex min-h-9 items-center gap-1 rounded-lg border border-[var(--color-neutral-200)] px-2.5 text-[13px] font-semibold text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-100)]"
        >
          <X size={14} strokeWidth={2.5} aria-hidden="true" />
          Cancel
        </button>
      </span>
      {priceEdit.error || empty ? (
        <p role="alert" className="text-[12px] font-medium text-[var(--color-danger-600,#C0341B)]">
          {priceEdit.error || "Enter an amount in rupees."}
        </p>
      ) : null}
    </div>
  );
}

export function CatalogueSection({ isAdmin, features, priceEdit, setPriceEdit, saveListPrice }) {
  return (
    <>
      <h1 className="text-[24px] font-extrabold tracking-[-0.025em] text-[var(--color-neutral-900)]">
        Features &amp; pricing
      </h1>
      <p className="mt-1.5 text-[14px] text-[var(--color-neutral-600)]">
        Everything Parisar sells. Grant or remove these per society from its detail panel.
      </p>
      <div className="mt-6 flex flex-col gap-2">
        {features.map((f) => (
          <div
            key={f.key}
            className="flex items-start justify-between gap-4 rounded-2xl border border-[var(--color-neutral-200)] bg-white p-4"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[15px] font-bold text-[var(--color-neutral-900)]">
                {f.name}
                {f.is_core ? (
                  <span className="rounded-full bg-[var(--color-brand-50)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-brand-700)]">
                    Core
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-neutral-600)]">
                {f.description}
              </p>
            </div>
            <div className="shrink-0">
              {f.is_core ? (
                <span className="text-[15px] font-extrabold text-[var(--color-neutral-900)]">
                  Included
                </span>
              ) : priceEdit?.key === f.key ? (
                <PriceEditor
                  feature={f}
                  priceEdit={priceEdit}
                  setPriceEdit={setPriceEdit}
                  saveListPrice={saveListPrice}
                />
              ) : isAdmin ? (
                <span className="flex items-center gap-2">
                  <span className="text-[15px] font-extrabold tabular-nums text-[var(--color-neutral-900)]">
                    ₹{f.price_monthly}/mo
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPriceEdit({ key: f.key, val: String(f.price_monthly), error: null })
                    }
                    aria-label={`Edit price for ${f.name}`}
                    className="pk-press inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--color-neutral-200)] px-2.5 text-[13px] font-semibold text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
                  >
                    <Pencil size={13} strokeWidth={2.2} aria-hidden="true" />
                    Edit
                  </button>
                </span>
              ) : (
                <span className="text-[15px] font-extrabold tabular-nums text-[var(--color-neutral-900)]">
                  from ₹{f.price_monthly}/mo
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-[var(--color-neutral-400)]">
        {isAdmin
          ? "Use Edit to set a feature's list price: the minimum any society can be charged for it. Core features are always on and never billed. Every change is recorded in the audit log."
          : "These are floor prices set by admin. When you enable a feature for a society you can charge this or more, never less."}
      </p>
    </>
  );
}
