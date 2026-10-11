// Appointed platform users — "All salespersons" and "All staff" share this view.

export function PeopleSection({ section, people, peopleErr, pending, onRevoke }) {
  return (
    <>
      <h1 className="font-extrabold text-[24px] text-[var(--color-neutral-900)] tracking-[-0.025em]">
        {section === "peopleSales" ? "All salespersons" : "All staff"}
      </h1>
      <p className="mt-1.5 text-[14px] text-[var(--color-neutral-600)]">
        {section === "peopleSales"
          ? "Everyone appointed to sell Parisar."
          : "Everyone appointed as staff."}
      </p>

      {peopleErr ? (
        <p role="alert" className="mt-4 font-medium text-[13px] text-[#b42318]">
          {peopleErr}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-2.5">
        {people === null ? (
          <p className="text-[14px] text-[var(--color-neutral-500)]">Loading…</p>
        ) : (
          (() => {
            const want = section === "peopleSales" ? "sales" : "staff";
            const rows = people.filter((u) => u.role === want);
            if (rows.length === 0) {
              return (
                <p className="text-[14px] text-[var(--color-neutral-500)]">Nobody appointed yet.</p>
              );
            }
            return rows.map((u) => (
              <div
                key={u.user_id}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-neutral-200)] bg-white px-4 py-3"
              >
                <span className="font-semibold text-[14px] text-[var(--color-neutral-900)]">
                  {u.full_name || u.note || "—"}
                </span>
                <a
                  href={`tel:${u.phone}`}
                  className="text-[13px] text-[var(--color-neutral-600)] underline underline-offset-2"
                >
                  {u.phone}
                </a>
                <span className="ml-auto text-[12px] text-[var(--color-neutral-500)] tabular-nums">
                  {new Date(u.created_at).toLocaleDateString("en-IN")}
                </span>
                <button
                  type="button"
                  disabled={pending === u.user_id}
                  onClick={() => onRevoke(u.user_id)}
                  className="shrink-0 rounded-lg border border-[var(--color-neutral-300)] px-2.5 py-1.5 font-bold text-[12px] text-[var(--color-neutral-700)] disabled:opacity-50 hover:border-[#b42318] hover:text-[#b42318] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
                >
                  {pending === u.user_id ? "Removing…" : "Remove"}
                </button>
              </div>
            ));
          })()
        )}
      </div>
    </>
  );
}
