// /join/invite/<token>: accept a family invite after OTP. Under /join/ so the
// verify screen sends a brand-new user here after sign-in (it honours ?next= for
// /join/ paths). The RPCs check the token, expiry and any bound phone.

import { InviteAccept } from "@/components/join/InviteAccept";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accept invitation — Parisar", robots: { index: false } };

export default async function JoinInvitePage({ params }) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("pin_set").eq("user_id", user.id).maybeSingle()
    : { data: null };
  return (
    <InviteAccept token={String(token ?? "").toLowerCase()} pinSet={Boolean(profile?.pin_set)} />
  );
}
