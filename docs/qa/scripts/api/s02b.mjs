import { login, rpc, noKey, sql, code, record } from "./lib.mjs";
import { readFileSync } from "node:fs";
const st = JSON.parse(readFileSync("state.json"));
let r = await noKey("rpc/admin_list_connect_requests", "POST", {});
record("TC-API-001b", "auth", "No apikey and no token: table read", "401 or empty", r, r.status === 401 || (Array.isArray(r.body) && r.body.length === 0));
const admin = await login("9000000030");
r = await rpc(admin, "admin_register_society", { p_name: "QA-T Lotus Duplicate", p_address_line: "12 QA Test Road", p_city: "Pune", p_state: "Maharashtra", p_pincode: "411001",
  p_landmark: null, p_authorities: [], p_request_id: st.reqId, p_registration_number: "QA-T-DUP-" + Date.now(), p_society_type: null, p_registration_date: null, p_official_email: null, p_official_phone: null, p_country: null, p_features: null });
record("TC-API-027b", "connect", "register again from same request, new reg number", "REQUEST_ALREADY_REGISTERED, no 2nd society", r, code(r) === "REQUEST_ALREADY_REGISTERED");
console.log(sql("select count(*) from societies where name like 'QA-T Lotus Dup%'"));
