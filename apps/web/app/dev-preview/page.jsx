// DEV-ONLY app-shell preview. Returns 404 outside development.
//
// WHY THIS EXISTS: every authenticated screen sits behind a server-side session
// check, so with no Supabase running there is literally no way to render the app
// shell — and therefore no way to measure or fix its responsive behaviour. This
// route mounts the REAL AppSidebar and the REAL DashboardClient with static
// props, so the layout can be audited at every viewport width without a
// database, a session, or a login.
//
// It is deliberately NOT under (protected): that layout is the very thing that
// redirects. It is also deliberately not a mock of the components — the
// components are the real ones, only their data is stubbed, so what gets
// measured here is what a resident actually sees.
//
// Delete alongside app/dev-login/route.js when the production OTP swap lands.

import { notFound } from "next/navigation";
import { AppSidebar } from "../../components/AppSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../../components/ui/sidebar";
import { DashboardClient } from "../(protected)/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

const MOCK = {
  userId: "00000000-0000-0000-0000-0000000000u1",
  societyId: "00000000-0000-0000-0000-00000000000a",
  societyName: "Green Meadows CHS",
  fullName: "Priya Sharma",
  flatLabel: "B-203",
};

export default function DevPreviewPage({ searchParams }) {
  if (process.env.NODE_ENV !== "development") notFound();

  // ?role=member|board_member|co_secretary|secretary — the tile grid and the
  // sidebar both branch on role, so each one needs auditing separately.
  const role = searchParams?.role || "secretary";

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar
        userId={MOCK.userId}
        societyId={MOCK.societyId}
        role={role}
        fullName={MOCK.fullName}
        flatLabel={MOCK.flatLabel}
        memberships={[{ society_id: MOCK.societyId, role, society_name: MOCK.societyName }]}
      />
      <SidebarInset>
        <div className="flex items-center gap-2 border-b px-4 py-2 lg:hidden">
          <SidebarTrigger />
          <span className="text-sm font-semibold">Dev preview — {role}</span>
        </div>
        <DashboardClient
          userId={MOCK.userId}
          role={role}
          societyId={MOCK.societyId}
          societyName={MOCK.societyName}
          fullName={MOCK.fullName}
          initialSummary={{
            complaints: { open: 3, preview: [] },
            notices: { recent: 2, preview: [] },
            bookings: { pending: 1, preview: [] },
            flat_actions: { outstanding: 0, preview: [] },
          }}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
