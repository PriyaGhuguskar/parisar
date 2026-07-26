"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";

// Sends the OTP. OTP verification is deliberately NOT here — it runs on the
// browser client so the session cookies land in the browser (RESEARCH.md Pitfall 2).
export async function sendOtpAction(phoneE164) {
  // PAR-013: validate server-side — the client is not trusted. Only dispatch an
  // SMS to a well-formed Indian E.164 number (+91 followed by a 6-9 lead + 9 digits).
  if (typeof phoneE164 !== "string" || !/^\+91[6-9]\d{9}$/.test(phoneE164)) {
    return { error: "Invalid phone number", status: 400 };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ phone: phoneE164 });
  if (error) return { error: error.message, status: error.status ?? null };
  return { success: true };
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  // T-04.1-02 mitigation: revoke push tokens for the current user before
  // clearing the session. Web doesn't currently register push tokens (PUSH-01
  // is mobile-only), but the deletion is defensive and protects against a
  // future Web Push integration. RLS on push_tokens additionally scopes to the
  // current user. We delete only platform='web' rows so mobile devices stay
  // registered (their tokens are revoked per-device on the mobile sign-out path).
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      await supabase.from("push_tokens").delete().eq("user_id", user.id).eq("platform", "web");
    }
  } catch (err) {
    // Defensive: don't block sign-out on push cleanup failure.
    console.warn("[signOutAction] push token revoke failed:", err);
  }
  await supabase.auth.signOut();
  redirect("/login");
}
