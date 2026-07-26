// /admin — Parisar staff console.
//
// Server component so the platform-admin check happens BEFORE any markup is
// produced. is_platform_admin() reads platform_admins, a table only the service
// role can see, and it is evaluated live on every request — revoking an admin
// takes effect immediately rather than when their token next refreshes.
//
// Entry is gated on is_platform_staff (admin OR sales). Which ROLE decides what
// the console shows — sales never sees billing or payments, enforced in the RPCs
// below, not just the UI. A non-staff user is sent to /dashboard rather than
// shown an error: confirming /admin exists tells an attacker something new.

import { redirect } from "next/navigation";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff console — Parisar" };

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isStaff } = await supabase.rpc("is_platform_staff");
  if (!isStaff) redirect("/dashboard");
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");

  // Leads come through RLS (enrollment_admin_read) — the policy is the security
  // boundary, not the query. Societies and stats come through SECURITY DEFINER
  // RPCs instead: every policy on societies / society_memberships is
  // tenant-scoped, and widening those to admit staff would put the entire tenant
  // boundary behind one admin check. The RPCs return only what this console
  // renders — no resident names, no resident phone numbers.
  const [{ data: leads }, { data: societies }, { data: stats }, { data: features }] =
    await Promise.all([
      supabase
        .from("society_enrollment_requests")
        .select(
          "id, society_name, contact_name, phone, preferred_slot, preferred_at, call_now, status, created_at",
        )
        .in("status", ["new", "contacted"])
        .order("call_now", { ascending: false })
        .order("preferred_at", { ascending: true, nullsFirst: false }),
      supabase.rpc("admin_list_societies"),
      supabase.rpc("admin_stats"),
      // The catalogue is readable by any signed-in user (a chairman should be
      // able to see what exists and what it costs), so a plain select is fine.
      supabase
        .from("platform_features")
        .select("key, name, description, price_monthly, is_core")
        .order("sort_order"),
    ]);

  return (
    <AdminConsole
      isAdmin={Boolean(isAdmin)}
      initialLeads={leads ?? []}
      initialSocieties={societies ?? []}
      initialStats={stats ?? {}}
      initialFeatures={features ?? []}
    />
  );
}
