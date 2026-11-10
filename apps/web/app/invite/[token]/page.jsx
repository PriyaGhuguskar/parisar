// /invite/<token>: public landing for a family invite link (allowlisted in
// lib/supabase/middleware.js, one segment only). Signed-in visitors go straight to
// the protected accept flow; everyone else is asked to sign in first. Nothing
// about the invite is looked up or shown here.

import { redirect } from "next/navigation";
import { INVITE_TOKEN_RE, InviteLanding } from "@/components/join/InviteLanding";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Household invitation — Parisar", robots: { index: false } };

export default async function InvitePage({ params }) {
  const { token } = await params;
  const clean = String(token ?? "").toLowerCase();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && INVITE_TOKEN_RE.test(clean)) redirect(`/join/invite/${clean}`);
  return <InviteLanding token={clean} />;
}
