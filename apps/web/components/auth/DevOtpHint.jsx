"use client";

// apps/web/components/auth/DevOtpHint.jsx
// DEV-ONLY on-screen OTP hint (OTP provider deferred — see PROJECT.md Key Decisions).
//
// Two dev mechanisms feed this banner:
//   * The seeded test numbers (+91 90000 00001…030) map to the fixed code 123456
//     via [auth.sms.test_otp] and skip the SMS hook entirely.
//   * ANY OTHER number goes through the dev_send_sms Postgres hook, which captures
//     the code GoTrue generated into public.dev_sms_otp. When a `phone` is given,
//     this banner fetches that real code with dev_peek_otp so arbitrary chairman /
//     resident numbers can log in without whitelisting each one.
//
// So: pass `phone` on the OTP screen to show the live code; omit it on the phone
// screen (where the number isn't known yet) to show the generic test-number hint.
//
// SAFETY: gated on `process.env.NODE_ENV !== "production"` (Next inlines this, so
// the branch is dead-code-eliminated from a production build). Remove this
// component, the test_otp block, and the dev_sms_otp table/hook when a real OTP
// provider is chosen.

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

const DEV_OTP = "123456";

export default function DevOtpHint({ phone }) {
  const [code, setCode] = useState(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !phone) return;
    let alive = true;
    // The hook writes the code moments after signInWithOtp; poll briefly.
    const tick = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.rpc("dev_peek_otp", { p_phone: phone });
        if (alive && data) setCode(data);
      } catch {
        /* dev convenience — ignore */
      }
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [phone]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-[14px] border border-dashed border-[var(--color-warning)]/45 bg-[var(--color-brand-50)] px-4 py-3"
    >
      <span className="text-sm font-bold text-[var(--color-neutral-900)]">
        🔧 Dev mode — SMS bypassed
      </span>
      {phone ? (
        <span className="text-sm text-[var(--color-neutral-600)]">
          Your code is <span className="font-bold tracking-widest">{code ?? DEV_OTP}</span>
          {code ? "" : " (test numbers), or check back in a moment."}
        </span>
      ) : (
        <span className="text-sm text-[var(--color-neutral-600)]">
          Test numbers 90000&nbsp;00001–00030 use{" "}
          <span className="font-bold tracking-widest">{DEV_OTP}</span>. Any other number shows its
          code on the next screen.
        </span>
      )}
    </div>
  );
}
