// STAGING ONLY — WRITES DATA. Guard creates visitor requests; residents poll notifications.
// Use a dedicated staging society seeded for load (names prefixed "LOAD-"). Clean up via
// the staging reset procedure afterwards. Env: GUARD_TOKENS_FILE, TOKENS_FILE, FLAT_IDS_FILE.
import http from "k6/http";
import { sleep } from "k6";
import { SharedArray } from "k6/data";
import { rpc, rest, tokenForVu, SOCIETY_ID } from "./lib.js";

const guards = new SharedArray("guards", () => JSON.parse(open(__ENV.GUARD_TOKENS_FILE)));
const flats = new SharedArray("flats", () => JSON.parse(open(__ENV.FLAT_IDS_FILE)));

export const options = {
  scenarios: {
    guards: { executor: "constant-arrival-rate", rate: Number(__ENV.VISITOR_RATE || 5), timeUnit: "1s",
      duration: __ENV.HOLD || "10m", preAllocatedVUs: 20, exec: "guard" },
    residents: { executor: "ramping-vus", stages: [{ duration: "2m", target: Number(__ENV.TARGET_VUS || 500) },
      { duration: __ENV.HOLD || "10m", target: Number(__ENV.TARGET_VUS || 500) }], exec: "resident" },
  },
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<1000"] },
};

export function guard() {
  const t = guards[(__VU - 1) % guards.length];
  const flat = flats[Math.floor(Math.random() * flats.length)];
  // Adjust the RPC name/params to the deployed guard API (see docs/onboarding/API.md).
  rpc("guard_create_visit", { p_flat_id: flat, p_visitor_name: `LOAD-${__VU}-${__ITER}`, p_visitor_phone: null, p_purpose: "delivery" }, t);
}

export function resident() {
  const t = tokenForVu();
  rest("visitor_requests?select=id,status&status=eq.pending&limit=10", t);
  rest("notifications?select=id,created_at&order=created_at.desc&limit=10", t);
  sleep(5);
}
