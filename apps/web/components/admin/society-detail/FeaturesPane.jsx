import { Check, Pencil } from "lucide-react";

export function FeaturesPane({
  features,
  featureTotal,
  busy,
  editKey,
  setEditKey,
  editVal,
  setEditVal,
  priceErr,
  setPriceErr,
  setSocietyPrice,
  toggleFeature,
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-xl bg-[var(--color-neutral-50)] px-4 py-3">
        <span className="text-[13px] text-[var(--color-neutral-600)]">Add-ons enabled</span>
        <span className="text-[15px] font-extrabold tabular-nums text-[var(--color-neutral-900)]">
          ₹{featureTotal.toLocaleString("en-IN")}/mo
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {features.map((f) => (
          <div
            key={f.key}
            className="flex items-start justify-between gap-4 rounded-xl border border-[var(--color-neutral-200)] bg-white p-3.5"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[14px] font-bold text-[var(--color-neutral-900)]">
                {f.name}
                {f.is_core ? (
                  <span className="rounded-full bg-[var(--color-brand-50)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-brand-700)]">
                    Core
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-neutral-600)]">
                {f.description}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              {f.is_core ? (
                <span className="text-[13px] font-bold text-[var(--color-neutral-900)]">
                  Included
                </span>
              ) : editKey === f.key ? (
                <span className="flex flex-col items-end gap-1">
                  <span className="flex items-center gap-1">
                    <span className="text-[13px] font-bold text-[var(--color-neutral-400)]">₹</span>
                    <input
                      // biome-ignore lint/a11y/noAutofocus: intentional — the field opened on click
                      autoFocus
                      inputMode="numeric"
                      value={editVal}
                      onChange={(e) => {
                        setEditVal(e.target.value.replace(/\D/g, "").slice(0, 6));
                        setPriceErr(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setSocietyPrice(f.key, Number(editVal) || 0);
                        if (e.key === "Escape") {
                          setEditKey(null);
                          setPriceErr(null);
                        }
                      }}
                      className="h-8 w-16 rounded-lg border border-[var(--color-brand-500)] px-2 text-right text-[13px] font-bold tabular-nums outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Save price"
                      onClick={() => setSocietyPrice(f.key, Number(editVal) || 0)}
                      className="pk-press rounded-md p-1 text-[var(--color-brand-600)] hover:bg-[var(--color-brand-50)]"
                    >
                      <Check size={14} strokeWidth={3} />
                    </button>
                  </span>
                  <span
                    className="text-[11px] font-medium"
                    style={{
                      color: priceErr ? "#C0341B" : "var(--color-neutral-400)",
                    }}
                  >
                    {priceErr ?? `Min ₹${f.floor ?? f.list_price}`}
                  </span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditKey(f.key);
                    setEditVal(String(f.price ?? f.list_price ?? 0));
                    setPriceErr(null);
                  }}
                  className="pk-press group/price flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-bold tabular-nums text-[var(--color-neutral-900)] hover:bg-[var(--color-neutral-100)]"
                  title="Set this society's price"
                >
                  ₹{f.price ?? f.list_price}
                  {f.price_override != null && f.price_override > (f.floor ?? f.list_price) ? (
                    <span className="text-[10px] font-normal text-[var(--color-neutral-400)]">
                      floor ₹{f.floor ?? f.list_price}
                    </span>
                  ) : null}
                  <Pencil
                    size={11}
                    strokeWidth={2.2}
                    aria-hidden="true"
                    className="text-[var(--color-neutral-400)] opacity-0 transition-opacity group-hover/price:opacity-100"
                  />
                </button>
              )}
              <button
                type="button"
                disabled={f.is_core || busy === f.key}
                onClick={() => toggleFeature(f.key, !f.enabled, f.price_override)}
                role="switch"
                aria-checked={f.enabled}
                aria-label={`${f.name} ${f.enabled ? "enabled" : "disabled"}`}
                className="pk-press relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  backgroundColor: f.enabled
                    ? "var(--color-brand-500)"
                    : "var(--color-neutral-200)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[left] duration-200"
                  style={{ left: f.enabled ? "22px" : "2px" }}
                />
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-neutral-400)]">
        Tap a price to set this society's rate. The catalogue price is the floor — you can charge
        that or more, never less. Core features cannot be switched off — a society without a notice
        board is a support ticket, not a saving.
      </p>
    </div>
  );
}
