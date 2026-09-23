// The staff console — deliberately empty.
//
// DELIBERATELY NOT INTERNATIONALISED: internal tooling, never seen by a
// resident. Same call as AdminConsole.jsx makes, for the same reason.
//
// WHY THERE IS NOTHING HERE. A staff user's capabilities are meant to come from
// an access-grant module the admin console does not have yet: an admin will pick
// what each staff user can do, and this surface will render exactly that. Until
// then a staff account can sign in and see that it exists and nothing more —
// `is_platform_admin_or_sales()` excludes role='staff' by construction, so every
// platform RPC would raise NOT_PLATFORM_STAFF if this page tried to call one.
//
// Showing an honest empty state beats showing a console of permission errors.
//
// JavaScript only — no TypeScript per CLAUDE.md.

export function StaffConsole({ fullName, phone }) {
  return (
    <main id="main-content" className="min-h-screen bg-[var(--color-neutral-50)] px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-neutral-500)]">
            Parisar
          </p>
          <h1 className="mt-1 font-bold text-2xl text-[var(--color-neutral-900)]">Staff console</h1>
        </header>

        <section className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-6">
          <h2 className="font-semibold text-[var(--color-neutral-900)] text-base">Signed in</h2>
          <dl className="mt-3 space-y-1 text-[var(--color-neutral-700)] text-sm">
            <div className="flex gap-2">
              <dt className="text-[var(--color-neutral-500)]">Name</dt>
              <dd>{fullName || "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-[var(--color-neutral-500)]">Phone</dt>
              <dd>{phone || "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-[var(--color-neutral-500)]">Role</dt>
              <dd>Staff</dd>
            </div>
          </dl>
        </section>

        <section className="mt-4 rounded-xl border border-dashed border-[var(--color-neutral-300)] bg-white p-6">
          <h2 className="font-semibold text-[var(--color-neutral-900)] text-base">
            No tools assigned yet
          </h2>
          <p className="mt-2 text-[var(--color-neutral-600)] text-sm leading-relaxed">
            An admin has not granted this account any capabilities. Once the access-grant module
            ships, whatever an admin turns on for you will appear here.
          </p>
        </section>

        <p className="mt-6">
          <a
            href="/login"
            className="text-[var(--color-neutral-500)] text-sm underline underline-offset-4 hover:text-[var(--color-neutral-800)]"
          >
            Sign out
          </a>
        </p>
      </div>
    </main>
  );
}
