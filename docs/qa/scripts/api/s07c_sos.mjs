// Complaints, notices, polls, bookings, visitors, SOS: per-role authorization + DB checks (society B).
import { login, rpc, rest, sql, code, record } from "./lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const st = JSON.parse(readFileSync("state.json"));
const B = st.B, F = st.F, A = st.A_SOC;
const s = {}; for (const [k, p] of Object.entries({ sec: "9000000027", tre: "9000000003", com: "9000000004", mem: "9000000007", grd: "9000000006", a14: "9000000014", a17: "9000000017" })) s[k] = await login(p);
let r, n = 400; const id = () => `TC-API-${++n}`;
// ---------- complaints
n = 452;
const sos = sql(`select id from sos_alerts where society_id='${B}' order by created_at desc limit 1`);
r = await rpc(s.grd, "security_dashboard", { p_society_id: B });
record(id(), "sos", "guard dashboard shows active SOS", "active_sos >= 1", r, r.body?.active_sos >= 1);
r = await rest(s.a14, "GET", `sos_alerts?id=eq.${sos}&select=id`);
record(id(), "sos", "secretary of A reads B SOS", "0 rows", r, Array.isArray(r.body) && r.body.length === 0);
r = await rpc(s.com, "resolve_sos", { p_id: sos });
record(id(), "sos", "committee member (not raiser) resolves", "NOT_ALLOWED", r, code(r) === "NOT_ALLOWED");
r = await rpc(s.a14, "resolve_sos", { p_id: sos });
record(id(), "sos", "secretary of A resolves B SOS", "refused", r, r.status >= 400);
r = await rpc(s.grd, "resolve_sos", { p_id: sos });
record(id(), "sos", "guard resolves", "observed", r, true, { note: "guard resolve rule" });
r = await rpc(s.tre, "resolve_sos", { p_id: sos });
const sres = sql(`select resolved_at is not null from sos_alerts where id='${sos}'`);
record(id(), "sos", "treasurer (manager) resolves", "resolved", `${r.status} ${JSON.stringify(r.body).slice(0, 80)} / resolved=${sres}`, sres === "t");
// extra: visitor privacy for a plain member on another flat
r = await rpc(s.grd, "guard_create_visit", { p_flat_id: F["A-201"], p_visitor_name: "QA-T Plumber visit", p_visitor_phone: "9876500000", p_purpose: "repair" });
const v2 = r.body?.request_id;
r = await rest(s.mem, "GET", `visitor_requests?id=eq.${v2}&select=id,visitor_name,visitor_phone,flat_id`);
record("TC-API-460", "visitors", "plain member (A-202) reads a visit for flat A-201", "0 rows (not my flat)", r, Array.isArray(r.body) && r.body.length === 0);
