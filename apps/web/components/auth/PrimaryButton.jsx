"use client";

// Full-width primary CTA button — 48px tall, brand.500 fill, rounded-xl.
// Props: label, onClick, type, loading, disabled

export default function PrimaryButton({
  label,
  onClick,
  type = "button",
  loading = false,
  disabled = false,
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        "w-full h-14 rounded-2xl text-[16px] font-bold flex items-center justify-center gap-2",
        "transition-[transform,background-color,box-shadow] duration-150 active:translate-y-px active:scale-[.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2",
        disabled || loading
          ? "bg-[var(--color-neutral-200)] text-[var(--color-neutral-400)] cursor-not-allowed"
          : "bg-[var(--color-brand-500)] text-[var(--color-neutral-0)] hover:bg-[var(--color-brand-600)] cursor-pointer shadow-[0_10px_26px_-10px_rgba(18,113,90,.5)]",
      ].join(" ")}
    >
      {loading ? (
        <>
          <span
            className="inline-block h-4 w-4 rounded-full border-2 border-[var(--color-neutral-0)] border-t-transparent animate-spin"
            aria-hidden="true"
          />
          {label}
        </>
      ) : (
        label
      )}
    </button>
  );
}
