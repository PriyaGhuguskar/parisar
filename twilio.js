// Twilio OTP adapter — structure only. Real API call is wired in Phase 8.
// Swapping to this adapter is a one-line change: set OTP_PROVIDER=twilio.
export default {
  name: "twilio",
  async send({ phone, otp }) {
    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const token = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!sid || !token) {
      throw new Error("Twilio env vars (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) not set");
    }
    void phone;
    void otp;
    throw new Error("Twilio adapter not yet implemented — wired in Phase 8");
  },
};
