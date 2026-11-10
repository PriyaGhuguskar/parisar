import { login, refresh, rpc, rest, sql, code, record, short } from "./lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const st = JSON.parse(readFileSync("state.json"));
const B = st.societyB.society_id, A_SOC = "06d44e6a-0eed-41c4-b64f-a21b30123ef7";
let c27 = await login("9000000027"); const m7 = await login("9000000007"); let r, mc;
const flats = JSON.parse(sql(`select json_agg(json_build_object('id',f.id,'label',w.code||'-'||f.number)) from flats f join wings w on w.id=f.wing_id where f.society_id='${B}'`));
const F = Object.fromEntries(flats.map((x) => [x.label, x.id]));
const codeB = st.societyB.code;
// authority onboard own flat
r = await rpc(c27, "onboard_resident", { p_code: codeB, p_flat_id: F["A-101"], p_full_name: "QA-T Chairman Lotus", p_residency: "owner", p_alt_phone: null, p_family: [] });
record("TC-API-053", "onboard", "authority onboards own flat", "status active", r, r.body?.status === "active");
mc = sql(`select count(*), string_agg(role::text||'/'||status||'/'||(flat_id is not null),',') from society_memberships where society_id='${B}' and user_id='${c27.user_id}'`);
record("TC-DB-012", "onboard", "DB: authority still one membership, now with flat", "1|secretary/active/true", mc, mc === "1|secretary/active/true");
// residents
const users = {};
for (const [p, flat] of [["9000000003", "A-102"], ["9000000004", "A-201"], ["9000000007", "A-202"]]) {
  const s = await login(p);
  r = await rpc(s, "onboard_flats_for_code", { p_code: codeB });
  r = await rpc(s, "onboard_resident", { p_code: codeB, p_flat_id: F[flat], p_full_name: `QA-T ${p.slice(-2)} Owner`, p_residency: "owner", p_alt_phone: null, p_family: [] });
  record(`TC-API-054-${p.slice(-2)}`, "onboard", `resident ${p} onboards ${flat} as owner`, "status active", r, r.body?.status === "active");
  users[p] = s.user_id;
}
r = await rpc(m7, "onboard_resident", { p_code: "ZZZZ-ZZZZ", p_flat_id: F["A-202"], p_full_name: "QA-T x", p_residency: "owner", p_alt_phone: null, p_family: [] });
record("TC-API-055", "onboard", "onboard with wrong society code", "{error: INVALID_CODE}", r, code(r) === "INVALID_CODE");
r = await rpc(m7, "onboard_resident", { p_code: codeB, p_flat_id: "00000000-0000-0000-0000-000000000001", p_full_name: "QA-T x", p_residency: "owner", p_alt_phone: null, p_family: [] });
record("TC-API-056", "onboard", "onboard with flat not in society", "{error: FLAT_NOT_IN_SOCIETY}", r, code(r) === "FLAT_NOT_IN_SOCIETY");
writeFileSync("state.json", JSON.stringify({ ...st, B, A_SOC, F, codeB, users: { ...users, "9000000027": c27.user_id } }, null, 1));
