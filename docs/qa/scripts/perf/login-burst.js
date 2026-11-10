// STAGING ONLY. Simultaneous login: OTP verify against test numbers that staging maps to a
// fixed code (staging test_otp), then PIN step is exercised through the web app separately.
// Never run against production. Needs staging GoTrue rate limits raised for the test window
// or a pool of source IPs, otherwise you are measuring the rate limiter (expect 429s).
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, PHONES_FILE (JSON array of "+91..." staging test numbers), TEST_OTP
import http from "k6/http";
import { check } from "k6";
import { SharedArray } from "k6/data";
import { SUPABASE_URL, ANON_KEY } from "./lib.js";

const phones = new SharedArray("phones", () => JSON.parse(open(__ENV.PHONES_FILE)));
export const options = {
  scenarios: {
    burst: {
      executor: "per-vu-iterations",
      vus: Number(__ENV.TARGET_VUS || 100),
      iterations: 1,
      maxDuration: "5m",
    },
  },
  thresholds: { http_req_failed: ["rate<0.02"], "http_req_duration{name:auth:verify}": ["p(95)<1500"] },
  summaryTrendStats: ["med", "p(95)", "p(99)", "max"],
};

export default function () {
  const phone = phones[(__VU - 1) % phones.length];
  const h = { apikey: ANON_KEY, "Content-Type": "application/json" };
  const r = http.post(
    `${SUPABASE_URL}/auth/v1/verify`,
    JSON.stringify({ type: "sms", phone, token: __ENV.TEST_OTP }),
    { headers: h, tags: { name: "auth:verify" } },
  );
  check(r, { "verify 200": (x) => x.status === 200 });
}
