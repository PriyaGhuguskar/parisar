// Shared helpers for Parisar k6 scripts. All secrets come from the environment:
//   SUPABASE_URL, SUPABASE_ANON_KEY, WEB_URL, TOKENS_FILE (JSON array of access tokens,
//   one per virtual user, minted beforehand by mint-tokens.sh against STAGING only).
import http from "k6/http";
import { check } from "k6";
import { SharedArray } from "k6/data";

export const SUPABASE_URL = __ENV.SUPABASE_URL;
export const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
export const SOCIETY_ID = __ENV.SOCIETY_ID; // society the tokens belong to
export const WEB_URL = __ENV.WEB_URL || "http://localhost:3000";
if (!SUPABASE_URL || !ANON_KEY) throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY");

export const tokens = new SharedArray("tokens", () =>
  __ENV.TOKENS_FILE ? JSON.parse(open(__ENV.TOKENS_FILE)) : [],
);

export function tokenForVu() {
  if (!tokens.length) throw new Error("TOKENS_FILE is empty");
  return tokens[(__VU - 1) % tokens.length];
}

export function headers(token) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token || ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

export function rpc(name, body, token, tag) {
  const r = http.post(`${SUPABASE_URL}/rest/v1/rpc/${name}`, JSON.stringify(body || {}), {
    headers: headers(token),
    tags: { name: tag || `rpc:${name}` },
  });
  check(r, { [`${name} 2xx`]: (x) => x.status >= 200 && x.status < 300 });
  return r;
}

export function rest(path, token, tag) {
  const r = http.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: headers(token),
    tags: { name: tag || `rest:${path.split("?")[0]}` },
  });
  check(r, { [`${path.split("?")[0]} 2xx`]: (x) => x.status >= 200 && x.status < 300 });
  return r;
}

// Standard staged profile: ramp to TARGET_VUS, hold, ramp down.
export function stagedOptions(defaultTarget) {
  const target = Number(__ENV.TARGET_VUS || defaultTarget || 100);
  return {
    scenarios: {
      main: {
        executor: "ramping-vus",
        startVUs: 0,
        stages: [
          { duration: __ENV.RAMP || "2m", target },
          { duration: __ENV.HOLD || "10m", target },
          { duration: "1m", target: 0 },
        ],
        gracefulRampDown: "30s",
      },
    },
    thresholds: {
      http_req_failed: ["rate<0.01"],
      http_req_duration: ["p(95)<800", "p(99)<2000"],
      checks: ["rate>0.99"],
    },
    summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
  };
}
