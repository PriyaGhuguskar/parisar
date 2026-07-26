"use client";

// Phone input row: locked +91 country-code selector + 10-digit input.
// Props: value, onChange, hasError

export default function PhoneInput({ value, onChange, hasError = false }) {
  return (
    // One field, not two boxes bolted together. The +91 sits INSIDE the control
    // behind a hairline, so the whole thing reads as a single 56px target —
    // large enough to hit reliably on a phone, which is where this is used.
    <div
      className={[
        "flex h-14 w-full items-center overflow-hidden rounded-2xl border bg-[var(--color-neutral-0)]",
        "transition-[border-color,box-shadow] duration-150",
        "focus-within:border-[var(--color-brand-500)]",
        "focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_18%,transparent)]",
        hasError ? "border-[var(--color-danger-500)]" : "border-[var(--color-neutral-200)]",
      ].join(" ")}
    >
      <span
        className="flex h-full shrink-0 select-none items-center gap-1.5 pl-4 pr-3 text-[16px] font-semibold text-[var(--color-neutral-900)]"
        aria-label="Country code: India +91"
      >
        <span aria-hidden="true">🇮🇳</span> +91
      </span>
      <span aria-hidden="true" className="h-7 w-px bg-[var(--color-neutral-200)]" />
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={10}
        placeholder="98765 43210"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
        aria-label="Mobile number (10 digits)"
        className="h-full min-w-0 flex-1 bg-transparent px-4 text-[17px] tracking-[0.04em] tabular-nums outline-none placeholder:tracking-normal placeholder:text-[var(--color-neutral-400)]"
      />
    </div>
  );
}
