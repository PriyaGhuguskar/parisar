import { Check, Pencil } from "lucide-react";

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
                <span className="flex items-center gap-1">
                  <span className="text-[15px] font-extrabold text-[var(--color-neutral-400)]">
                    ₹
                  </span>
                  <input
                    // biome-ignore lint/a11y/noAutofocus: opened on click
                    autoFocus
                    inputMode="numeric"
                    value={priceEdit.val}
                    onChange={(e) =>
                      setPriceEdit({
                        key: f.key,
                        val: e.target.value.replace(/\D/g, "").slice(0, 6),
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveListPrice(f.key, Number(priceEdit.val) || 0);
                      if (e.key === "Escape") setPriceEdit(null);
                    }}
                    className="h-9 w-20 rounded-lg border border-[var(--color-brand-500)] px-2 text-right text-[15px] font-extrabold tabular-nums outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Save price"
                    onClick={() => saveListPrice(f.key, Number(priceEdit.val) || 0)}
                    className="pk-press rounded-md p-1.5 text-[var(--color-brand-600)] hover:bg-[var(--color-brand-50)]"
                  >
                    <Check size={16} strokeWidth={3} />
                  </button>
                </span>
              ) : isAdmin ? (
                <button
                  type="button"
                  onClick={() => setPriceEdit({ key: f.key, val: String(f.price_monthly) })}
                  className="pk-press group/p flex items-center gap-1.5 rounded-lg px-2 py-1 text-[15px] font-extrabold tabular-nums text-[var(--color-neutral-900)] hover:bg-[var(--color-neutral-100)]"
                  title="Edit list price"
                >
                  ₹{f.price_monthly}/mo
                  <Pencil
                    size={13}
                    strokeWidth={2.2}
                    aria-hidden="true"
                    className="text-[var(--color-neutral-400)] opacity-0 transition-opacity group-hover/p:opacity-100"
                  />
                </button>
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
          ? "Tap a price to set the floor — the minimum any society can be charged for that feature. Core features are always on and never billed."
          : "These are floor prices set by admin. When you enable a feature for a society you can charge this or more, never less."}
      </p>
    </>
  );
}
