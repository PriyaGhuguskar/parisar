// /verification: confirm the details a society added for this verified phone.
// Signed in only; a membership is not needed (that is what confirming creates).

import { redirect } from "next/navigation";
import { ResidentVerification } from "@/components/verification/ResidentVerification";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your details — Parisar" };

export default async function VerificationPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("pin_set")
    .eq("user_id", user.id)
    .maybeSingle();
  return <ResidentVerification pinSet={Boolean(profile?.pin_set)} />;
}
