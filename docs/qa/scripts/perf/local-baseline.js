// LOCAL DEV-MODE BASELINE ONLY (low concurrency, read-only endpoints, no think time).
// k6 run -e TARGET=resident_dashboard -e VUS=10 -e DURATION=30s \
//   -e SUPABASE_URL=http://127.0.0.1:54321 -e SUPABASE_ANON_KEY=... \
//   -e MEMBER_TOKEN=... -e ADMIN_TOKEN=... -e SOCIETY_ID=... local-baseline.js
import http from "k6/http";
import { check } from "k6";

const U = __ENV.SUPABASE_URL, K = __ENV.SUPABASE_ANON_KEY, S = __ENV.SOCIETY_ID;
const WEB = __ENV.WEB_URL || "http://localhost:3000";
const h = (t) => ({ headers: { apikey: K, Authorization: `Bearer ${t}`, "Content-Type": "application/json" } });

const targets = {
  resident_dashboard: () => http.post(`${U}/rest/v1/rpc/resident_dashboard`, JSON.stringify({ p_society_id: S }), h(__ENV.MEMBER_TOKEN)),
  admin_dashboard: () => http.post(`${U}/rest/v1/rpc/society_admin_dashboard`, JSON.stringify({ p_society_id: S }), h(__ENV.ADMIN_TOKEN)),
  complaints_list: () => http.get(`${U}/rest/v1/complaints?select=id,kind,description,status,created_at&order=created_at.desc&limit=20`, h(__ENV.MEMBER_TOKEN)),
  memberships_list: () => http.get(`${U}/rest/v1/society_memberships?select=id,role,resident_type,flat_id&limit=50`, h(__ENV.ADMIN_TOKEN)),
  landing_page: () => http.get(`${WEB}/`),
};

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "30s",
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export default function () {
  const r = targets[__ENV.TARGET]();
  check(r, { "2xx": (x) => x.status >= 200 && x.status < 300 });
}
