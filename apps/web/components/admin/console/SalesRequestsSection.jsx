export function SalesRequestsSection({ isAdmin, salesApps, pending, onApprove }) {
  return (
    <>
      <h1 className="font-extrabold text-[24px] text-[var(--color-neutral-900)] tracking-[-0.025em]">
        Sales requests
      </h1>
      <p className="mt-1.5 text-[14px] text-[var(--color-neutral-600)]">
        People who applied to sell Parisar, newest first.
      </p>
      <div className="mt-6 flex flex-col gap-2.5">
        {salesApps === null ? (
          <p className="text-[14px] text-[var(--color-neutral-500)]">Loading…</p>
        ) : salesApps.length === 0 ? (
          <p className="text-[14px] text-[var(--color-neutral-500)]">No applications yet.</p>
        ) : (
          salesApps.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-neutral-200)] bg-white px-4 py-3"
            >
              <span className="font-semibold text-[14px] text-[var(--color-neutral-900)]">
                {a.full_name}
              </span>
              <a
                href={`tel:${a.phone}`}
                className="text-[13px] text-[var(--color-neutral-600)] underline underline-offset-2"
              >
                {a.phone}
              </a>
              <span className="ml-auto text-[12px] text-[var(--color-neutral-500)] tabular-nums">
                {new Date(a.created_at).toLocaleDateString("en-IN")}
              </span>
              <span className="rounded-full bg-[var(--color-neutral-100)] px-2 py-0.5 font-semibold text-[11px] text-[var(--color-neutral-700)]">
                {a.status}
              </span>
              {/* Only an admin can appoint — admin_create_platform_user
                          is gated on is_platform_admin(), so this would fail for
                          a sales user reading the same queue. */}
              {isAdmin ? (
                <button
                  type="button"
                  disabled={pending === a.id}
                  onClick={() => onApprove(a)}
                  className="shrink-0 rounded-lg border border-[var(--color-brand-500)] px-2.5 py-1.5 font-bold text-[12px] text-[var(--color-brand-700)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
                >
                  {pending === a.id ? "Adding…" : "Add as salesperson"}
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </>
  );
}
