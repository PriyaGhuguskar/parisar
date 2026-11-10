// Part 16 isolation + direct-table authorization. Every society-scoped table is read with
// each role's JWT, filtered to the OTHER society; any row returned is a leak.
import { login, refresh, rest, rpc, sql, code, record } from "./lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const st = JSON.parse(readFileSync("state.json"));
const B = st.B, A = st.A_SOC;
const TABLES = sql(`select string_agg(c.relname, ',' order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and exists(select 1 from information_schema.columns where table_schema='public' and table_name=c.relname and column_name='society_id')`).split(",");
const who = { chairman: ["9000000027", A], treasurer: ["9000000003", A], committee: ["9000000004", A], member: ["9000000007", A], guard: ["9000000006", A],
  "A-secretary": ["9000000014", B], "A-owner": ["9000000017", B], "A-tenant": ["9000000019", B], "A-family": ["9000000020", B] };
const leaks = {}; let n = 300;
for (const [role, [phone, other]] of Object.entries(who)) {
  const s = await login(phone);
  const bad = [];
  for (const t of TABLES) {
    const r = await rest(s, "GET", `${t}?select=society_id&society_id=eq.${other}&limit=5`);
    if (r.status === 200 && Array.isArray(r.body) && r.body.length > 0) bad.push(`${t}(${r.body.length})`);
  }
  // unfiltered: any row of another society at all?
  const r2 = await rest(s, "GET", `society_memberships?select=society_id`);
  const foreign = Array.isArray(r2.body) ? r2.body.filter((x) => x.society_id !== (other === A ? B : A)).length : -1;
  if (foreign > 0) bad.push(`society_memberships unfiltered foreign=${foreign}`);
  leaks[role] = bad;
  record(`TC-ISO-${++n}`, "iso", `${role}: read every society-scoped table (${TABLES.length}) filtered to the other society`, "0 rows from every table", bad.length ? bad.join(", ") : `0 rows from all ${TABLES.length} tables`, bad.length === 0);
}
// cross-society RPCs with the other society's ids
const c27 = await login("9000000027"), c14 = await login("9000000014");
const aFlat = sql(`select id from flats where society_id='${A}' limit 1`);
const aComplaint = sql(`select id from complaints where society_id='${A}' limit 1`);
const aUser = sql(`select user_id from society_memberships where society_id='${A}' and role='member' limit 1`);
const probes = [
  ["setup_get_state", { p_society_id: A }], ["society_admin_dashboard", { p_society_id: A }], ["resident_dashboard", { p_society_id: A }],
  ["manager_list_resident_records", { p_society_id: A }], ["manager_list_staff", { p_society_id: A }], ["manager_list_tenants", { p_society_id: A }],
  ["import_list_batches", { p_society_id: A }], ["get_society_registration", { p_society_id: A }], ["my_society_features", { p_society_id: A }],
  ["list_flat_owners", { p_flat_id: aFlat }], ["reveal_phone", { p_target_user_id: aUser }], ["set_active_society", { p_society_id: A }],
  ["family_invite_list", { p_society_id: A }], ["manager_resident_type_counts", { p_society_id: A }],
];
if (aComplaint) probes.push(["add_complaint_response", { p_complaint_id: aComplaint, p_response_kind: "in_progress", p_free_text: "QA-T cross-society probe" }]);
for (const [fn, args] of probes) {
  const r = await rpc(c27, fn, args);
  const ok = r.status >= 400 || (r.body && r.body.error);
  record(`TC-ISO-${++n}`, "iso", `secretary of B calls ${fn} with society A ids`, "refused, no A data", r, !!ok);
}
// reverse direction: A secretary on B ids (read-only RPCs)
for (const [fn, args] of [["society_admin_dashboard", { p_society_id: B }], ["manager_list_resident_records", { p_society_id: B }], ["setup_get_state", { p_society_id: B }]]) {
  const r = await rpc(c14, fn, args);
  record(`TC-ISO-${++n}`, "iso", `secretary of A calls ${fn} on society B`, "refused", r, r.status >= 400 || !!r.body?.error);
}
// privilege escalation through direct writes (member 07)
const m7 = await login("9000000007"), U = st.users;
let r = await rest(m7, "PATCH", `society_memberships?user_id=eq.${m7.user_id}`, { role: "secretary" });
let after = sql(`select role from society_memberships where user_id='${m7.user_id}' and society_id='${B}'`);
record(`TC-ISO-${++n}`, "iso", "member PATCHes own society_memberships.role to secretary", "denied, role unchanged", `${r.status} ${JSON.stringify(r.body).slice(0, 120)} / role=${after}`, after === "member" && r.status >= 400);
r = await rest(m7, "POST", "platform_admins", { user_id: m7.user_id, role: "admin" });
record(`TC-ISO-${++n}`, "iso", "member INSERTs itself into platform_admins", "denied", r, r.status >= 400);
r = await rest(m7, "PATCH", `societies?id=eq.${B}`, { name: "QA-T hacked" });
record(`TC-ISO-${++n}`, "iso", "member PATCHes societies.name", "denied", r, r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0));
r = await rest(m7, "POST", "society_features", { society_id: B, feature_key: "parking", enabled: true });
record(`TC-ISO-${++n}`, "iso", "member INSERTs society_features row (has table grant)", "denied by RLS", r, r.status >= 400);
r = await rest(m7, "PATCH", `platform_features?key=eq.notices`, { price_monthly: 1 });
record(`TC-ISO-${++n}`, "iso", "member PATCHes platform_features price (has column grant)", "0 rows changed", r, r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0));
r = await rest(m7, "POST", "society_guards", { society_id: B, user_id: m7.user_id, name: "QA-T fake", phone: "9000000007", status: "active" });
record(`TC-ISO-${++n}`, "iso", "member INSERTs itself as a guard", "denied", r, r.status >= 400);
r = await rest(m7, "PATCH", `profiles?user_id=eq.${m7.user_id}`, { active_society_id: A });
record(`TC-ISO-${++n}`, "iso", "member PATCHes profiles.active_society_id to society A", "denied (no column grant)", r, r.status >= 400);
r = await rpc(m7, "set_active_society", { p_society_id: A });
record(`TC-ISO-${++n}`, "iso", "member set_active_society to a society it is not in", "refused", r, r.status >= 400 || !!r.body?.error);
const m7r = await refresh(m7);
const cl = JSON.parse(Buffer.from(m7r.access_token.split(".")[1], "base64url").toString()).app_metadata;
record(`TC-ISO-${++n}`, "iso", "member JWT after those attempts", `society_id=B, role=member`, JSON.stringify({ s: cl.society_id, r: cl.role }), cl.society_id === B && cl.role === "member");
r = await rest(m7, "GET", `profiles?select=user_id,full_name,phone&limit=50`);
record(`TC-ISO-${++n}`, "iso", "member reads profiles.phone directly", "phone column not readable", r, r.status >= 400);
r = await rest(m7, "GET", `profiles?select=user_id,full_name&limit=200`);
const ids = Array.isArray(r.body) ? r.body.map((x) => x.user_id) : [];
const foreignProfiles = ids.length ? sql(`select count(*) from society_memberships where user_id in (${ids.map((i) => `'${i}'`).join(",")}) and society_id='${A}'`) : "0";
record(`TC-ISO-${++n}`, "iso", "member lists profiles: none belong to society A", "0", `${ids.length} profiles visible, ${foreignProfiles} in A`, foreignProfiles === "0");
writeFileSync("leaks.json", JSON.stringify(leaks, null, 1));
