"use server";
import { redirect } from "next/navigation";
import { otpErrorCode } from "../../lib/auth/otpErrors";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { isIndianMobileE164 } from "../../lib/validation";

// Sends the OTP. OTP verification is deliberately NOT here — it runs on the
// browser client so the session cookies land in the browser (RESEARCH.md Pitfall 2).
export async function sendOtpAction(phoneE164) {
  // PAR-013: validate server-side — the client is not trusted. Only dispatch an
  // SMS to a well-formed Indian E.164 number (+91 followed by a 6-9 lead + 9 digits).
  // Errors are stable codes (rate_limited | invalid_phone | network | unknown)
  // the UI maps to localized keys via otpErrorKey — never GoTrue's raw message.
  if (!isIndianMobileE164(phoneE164)) {
    return { error: "invalid_phone" };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({ phone: phoneE164 });
    if (error) return { error: otpErrorCode(error) };
  } catch {
    return { error: "network" };
  }
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
    console.error("[signOutAction] push token revoke failed:", err?.message ?? "unknown");
  }
  await supabase.auth.signOut();
  redirect("/login");
}
