import { Building2 } from "lucide-react";

// Live preview — fills in as staff type, so the artifact they are
// about to create is visible before they commit.
export function CreatePreview({ form }) {
  return (
    <aside className="lg:sticky lg:top-8">
      <div className="overflow-hidden rounded-2xl border border-[var(--color-neutral-200)] bg-white">
        <div
          className="flex items-center gap-2.5 px-5 py-4"
          style={{ background: "linear-gradient(135deg, var(--color-brand-50), #fff)" }}
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
          >
            <Building2 size={18} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-extrabold tracking-[-0.01em] text-[var(--color-neutral-900)]">
              {form.name.trim() || "New society"}
            </p>
            <p className="text-[12px] text-[var(--color-neutral-600)]">
              {[form.city.trim(), form.state].filter(Boolean).join(", ") || "Location pending"}
            </p>
          </div>
        </div>
        <dl className="divide-y divide-[var(--color-neutral-200)] px-5 text-[13px]">
          {[
            ["Address", [form.addressLine, form.landmark].filter((x) => x.trim()).join(" · ")],
            ["PIN", form.pincode],
            [
              "Authorities",
              form.authorities
                .map((a) => a.name.trim())
                .filter(Boolean)
                .join(", "),
            ],
          ].map(([label, val]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 py-2.5">
              <dt className="shrink-0 text-[var(--color-neutral-400)]">{label}</dt>
              <dd
                className="truncate text-right font-semibold"
                style={{
                  color: val ? "var(--color-neutral-900)" : "var(--color-neutral-300)",
                }}
              >
                {val || "—"}
              </dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-[var(--color-neutral-200)] px-5 py-3.5 text-[12px] leading-relaxed text-[var(--color-neutral-400)]">
          A join code is generated on create — you read it out on the call.
        </p>
      </div>
    </aside>
  );
}
