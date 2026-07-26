// Stub OTP adapter. Used when OTP_PROVIDER=stub (the dev default).
// In local dev, [auth.sms.test_otp] handles OTP delivery for test numbers and the
// hook is never called for them. This stub is the safe fallback for any non-test
// number typed during manual QA: it logs and returns without sending an SMS.
export default {
  name: "stub",
  async send({ phone }) {
    // PAR-006: never log the OTP itself — it is a cleartext credential. Dev OTP
    // delivery for test numbers is handled by [auth.sms.test_otp], not this stub.
    console.log(`[stub-sms] OTP dispatch requested for ${phone} (no SMS sent — dev stub)`);
  },
};
