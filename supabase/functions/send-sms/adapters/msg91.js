// MSG91 OTP adapter — structure only. Real API call is wired in Phase 8 once the
// DLT-registered template_id is available. Swapping to this adapter is a one-line
// change: set OTP_PROVIDER=msg91 (no client-code edits).
export default {
  name: "msg91",
  async send({ phone, otp }) {
    const authKey = Deno.env.get("MSG91_AUTH_KEY");
    const templateId = Deno.env.get("MSG91_TEMPLATE_ID"); // DLT-registered template
    if (!authKey || !templateId) {
      throw new Error("MSG91 env vars (MSG91_AUTH_KEY, MSG91_TEMPLATE_ID) not set");
    }
    void phone;
    void otp;
    throw new Error("MSG91 adapter not yet implemented — wired in Phase 8");
  },
};
