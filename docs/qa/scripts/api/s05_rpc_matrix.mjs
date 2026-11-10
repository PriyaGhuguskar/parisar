// Role x RPC matrix. Usage: node s05_rpc_matrix.mjs [phase]   phase "sales" runs only the sales column.
import { login, rpc, code, record } from "./lib.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const st = JSON.parse(readFileSync("state.json"));
const B = st.B, F = st.F, U = st.users;
const phase = process.argv[2] || "main";
const ROLES = phase === "sales" ? { sales: "9000000007" } : {
  anon: null, admin: "9000000030", chairman: "9000000027", treasurer: "9000000003", committee: "9000000004",
  member: "9000000007", guard: "9000000006", "A-secretary": "9000000014", "A-owner": "9000000017", "A-tenant": "9000000019", "A-family": "9000000020" };
const M = ["chairman", "treasurer"], RES = ["chairman", "treasurer", "committee", "member"], STAFF = ["admin", "sales"];
const P = [
  ["setup_get_state", { p_society_id: B }, [...M, ...STAFF]],
  ["society_admin_dashboard", { p_society_id: B }, [...M, ...STAFF]],
  ["resident_dashboard", { p_society_id: B }, RES],
  ["security_dashboard", { p_society_id: B }, ["guard"]],
  ["guard_list_flats", {}, ["guard"]],
  ["manager_list_resident_records", { p_society_id: B }, M],
  ["manager_list_society_residents", { p_society_id: B, p_resident_type: "owner", p_search: null, p_status: null, p_limit: 25, p_offset: 0 }, M],
  ["manager_resident_type_counts", { p_society_id: B }, M],
  ["manager_list_staff", { p_society_id: B }, M],
  ["manager_list_tenants", { p_society_id: B }, M],
  ["import_list_batches", { p_society_id: B }, M],
  ["get_society_registration", { p_society_id: B }, [...RES, ...STAFF]],
  ["my_society_features", { p_society_id: B }, [...RES, "guard", ...STAFF]],
  ["family_invite_list", { p_society_id: B }, RES],
  ["list_flat_owners", { p_flat_id: F["A-202"] }, [...M, "member"]],
  ["reveal_phone", { p_target_user_id: U["9000000007"] }, RES],
  ["get_dashboard_summary", { p_view: null }, [...RES, "A-secretary", "A-owner", "A-tenant", "A-family"]],
  ["admin_list_societies", {}, STAFF],
  ["admin_stats", {}, STAFF],
  ["admin_onboarding_metrics", {}, STAFF],
  ["admin_society_detail", { p_society_id: B }, STAFF],
  ["admin_society_authorities", { p_society_id: B }, STAFF],
  ["admin_society_history", { p_society_id: B, p_limit: 5 }, STAFF],
  ["admin_list_connect_requests", {}, STAFF],
  ["admin_list_platform_users", {}, ["admin"]],
  ["admin_list_platform_audit", { p_limit: 5 }, ["admin"]],
];
// "allowed" = 200 and no {error}. Empty list / null for out-of-scope callers counts as "empty".
function cell(r) {
  if (r.status === 401) return "401";
  if (r.status >= 400) return code(r) || String(r.status);
  if (r.body && typeof r.body === "object" && !Array.isArray(r.body) && r.body.error) return String(r.body.error);
  if (r.body === null || (Array.isArray(r.body) && r.body.length === 0)) return "empty";
  return "OK";
}
const sess = {};
for (const [k, p] of Object.entries(ROLES)) sess[k] = p ? await login(p) : "anon";
const store = existsSync("matrix_rpc.json") ? JSON.parse(readFileSync("matrix_rpc.json")) : {};
let i = phase === "sales" ? 200 : 100;
for (const [fn, args, allowed] of P) {
  store[fn] ||= {};
  const bad = [];
  for (const k of Object.keys(ROLES)) {
    const r = await rpc(sess[k], fn, args);
    const c = cell(r);
    store[fn][k] = c;
    const want = allowed.includes(k);
    const ok = want ? c === "OK" || c === "empty" : c !== "OK";
    if (!ok) bad.push(`${k}=${c}${want ? " (expected OK)" : " (expected refusal)"}`);
  }
  i++;
  record(`TC-ROLE-${i}`, "role-rpc", `${fn}: role matrix${phase === "sales" ? " (sales)" : ""}`, `allowed only: ${allowed.join(", ")}`,
    Object.keys(ROLES).map((k) => `${k}=${store[fn][k]}`).join("; "), bad.length === 0, { mismatch: bad.join("; ") });
}
writeFileSync("matrix_rpc.json", JSON.stringify(store, null, 1));
