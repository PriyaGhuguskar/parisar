// Route-level loading UI for /notices.
//
// The list is force-dynamic SSR, so there IS a server round-trip before the
// first card paints. A skeleton shaped like the notice stack keeps the layout
// from jumping when the real rows arrive.

import { ListSkeleton, PageShell } from "@/components/kit";

export default function NoticesLoading() {
  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      <PageShell>
        <div className="mb-6 h-9 w-40 animate-pulse rounded-lg bg-[var(--color-neutral-100)] sm:mb-8" />
        <ListSkeleton rows={5} />
      </PageShell>
    </div>
  );
}
