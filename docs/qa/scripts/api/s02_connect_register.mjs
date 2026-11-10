import { login, rpc, rest, noKey, sql, code, record, short } from "./lib.mjs";
import { writeFileSync } from "node:fs";
const A = "connect";
const slot = new Date(Date.now() + 2 * 86400e3).toISOString();
// T-API-C01 no apikey at all
let r = await noKey("rpc/submit_connect_request", "POST", {});
record("TC-API-001", A, "submit_connect_request without apikey", "401", r, r.status === 401);
// validation
r = await rpc("anon", "submit_connect_request", { p_society_name: "Q", p_contact_name: "QA-T Chair", p_phone: "9000000027", p_preferred_at: slot });
record("TC-API-002", A, "submit: society name 1 char", "INVALID_SOCIETY_NAME", r, code(r) === "INVALID_SOCIETY_NAME");
r = await rpc("anon", "submit_connect_request", { p_society_name: "QA-T Lotus Society", p_contact_name: "QA-T Chair", p_phone: "12345", p_preferred_at: slot });
record("TC-API-003", A, "submit: bad phone", "INVALID_PHONE", r, code(r) === "INVALID_PHONE");
r = await rpc("anon", "submit_connect_request", { p_society_name: "QA-T Lotus Society", p_contact_name: "QA-T Chair", p_phone: "9000000027" });
record("TC-API-004", A, "submit: no slot and not call-now", "SLOT_REQUIRED", r, code(r) === "SLOT_REQUIRED");
r = await rpc("anon", "submit_connect_request", { p_society_name: "QA-T Lotus Society", p_contact_name: "QA-T Chair", p_phone: "9000000027", p_preferred_at: "2020-01-01T00:00:00Z" });
record("TC-API-005", A, "submit: slot in past", "SLOT_IN_PAST", r, code(r) === "SLOT_IN_PAST");
r = await rpc("anon", "submit_connect_request", { p_society_name: "QA-T Lotus Society", p_contact_name: "QA-T Chair", p_phone: "9000000027", p_email: "not-an-email", p_preferred_at: slot });
record("TC-API-006", A, "submit: bad email", "INVALID_EMAIL", r, code(r) === "INVALID_EMAIL");
// happy path
r = await rpc("anon", "submit_connect_request", { p_society_name: "QA-T Lotus Society", p_contact_name: "QA-T Chairman Lotus", p_phone: "9000000027", p_email: "qa-t-lotus@example.com",
  p_authority_numbers: [{ phone: "9000000027", name: "dup" }], p_preferred_at: slot, p_message: "QA-T roles test" });
const ok = r.status === 200 && /^PR-/.test(r.body?.request_code || "");
record("TC-API-007", A, "submit: valid request (anon)", "200 with request_code, status call_scheduled", r, ok && r.body.status === "call_scheduled");
const reqCode = r.body?.request_code;
const exposed = r.body && ("id" in r.body || "phone" in r.body);
record("TC-API-008", A, "submit: response does not expose id/phone", "only public fields", JSON.stringify(Object.keys(r.body || {})), !exposed);
r = await rpc("anon", "submit_connect_request", { p_society_name: "QA-T Lotus Society 2", p_contact_name: "QA-T Chairman Lotus", p_phone: "+91 90000 00027", p_call_now: true });
record("TC-API-009", A, "submit: duplicate open request same phone (other format)", "{error: REQUEST_ALREADY_OPEN}", r, code(r) === "REQUEST_ALREADY_OPEN");
const dupRows = sql("select count(*) from society_enrollment_requests where phone like '%9000000027%' and status in ('new','call_scheduled','rescheduled','contacted')");
record("TC-DB-001", A, "DB: exactly one open request for phone", "1", dupRows, dupRows === "1");
const an = sql("select authority_numbers::text from society_enrollment_requests where request_code='" + reqCode + "'");
record("TC-DB-002", A, "DB: duplicate authority number of contact dropped", "1 entry", an, (an.match(/phone/g) || []).length === 1);
// status lookup
r = await rpc("anon", "get_connect_request_status", { p_request_code: reqCode, p_phone: "9000000027" });
record("TC-API-010", A, "status lookup with code+phone", "200 status call_scheduled", r, r.status === 200 && r.body?.status === "call_scheduled");
r = await rpc("anon", "get_connect_request_status", { p_request_code: reqCode, p_phone: "9000000028" });
record("TC-API-011", A, "status lookup with wrong phone", "REQUEST_NOT_FOUND", r, code(r) === "REQUEST_NOT_FOUND");
// anon direct table read
r = await rest("anon", "GET", "society_enrollment_requests?select=*&limit=5");
record("TC-API-012", A, "anon direct select on society_enrollment_requests", "no rows / 401", r, r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0));
// non-staff calls admin RPC
const m7 = await login("9000000007");
r = await rpc(m7, "admin_list_connect_requests", {});
record("TC-API-013", A, "admin_list_connect_requests as plain user", "NOT_PLATFORM_STAFF", r, code(r) === "NOT_PLATFORM_STAFF");
r = await rpc("anon", "admin_list_connect_requests", {});
record("TC-API-014", A, "admin_list_connect_requests as anon", "401/permission denied", r, r.status === 401 || r.status === 403 || code(r) === "AUTH_REQUIRED" || code(r) === "NOT_PLATFORM_STAFF");
// staff list/get
const admin = await login("9000000030");
r = await rpc(admin, "admin_list_connect_requests", { p_search: reqCode });
const item = r.body?.items?.[0];
record("TC-API-015", A, "admin list search by request code", "1 item", r, r.status === 200 && r.body.total === 1 && item?.request_code === reqCode);
const reqId = item?.id;
r = await rpc(admin, "admin_list_connect_requests", { p_status: "bogus" });
record("TC-API-016", A, "admin list invalid status filter", "INVALID_STATUS", r, code(r) === "INVALID_STATUS");
r = await rpc(admin, "admin_get_connect_request", { p_request_id: "00000000-0000-0000-0000-000000000000" });
record("TC-API-017", A, "admin get unknown id", "REQUEST_NOT_FOUND", r, code(r) === "REQUEST_NOT_FOUND");
r = await rpc(admin, "admin_reschedule_connect_request", { p_request_id: reqId, p_scheduled_at: new Date(Date.now() + 3 * 86400e3).toISOString(), p_note: "QA-T reschedule" });
record("TC-API-018", A, "admin reschedule", "200 status rescheduled", r, r.status === 200 && r.body?.status === "rescheduled");
r = await rpc(admin, "admin_reschedule_connect_request", { p_request_id: reqId, p_scheduled_at: "2020-01-01T00:00:00Z" });
record("TC-API-019", A, "admin reschedule into past", "SLOT_IN_PAST", r, code(r) === "SLOT_IN_PAST");
r = await rpc(admin, "admin_mark_connect_called", { p_request_id: reqId, p_note: "QA-T called" });
record("TC-API-020", A, "admin mark called", "200 status contacted", r, r.status === 200 && r.body?.status === "contacted");
r = await rpc(admin, "admin_reject_connect_request", { p_request_id: reqId, p_reason: "x" });
record("TC-API-021", A, "admin reject with 1-char reason", "INVALID_REASON", r, code(r) === "INVALID_REASON");
r = await rpc(admin, "admin_get_connect_request", { p_request_id: reqId });
const hist = (r.body?.history || []).map((h) => h.action);
record("TC-API-022", A, "admin get shows history", "submitted, rescheduled, called", JSON.stringify(hist), hist.includes("connect.submitted") && hist.includes("connect.rescheduled") && hist.includes("connect.called"));
// register society: validation then happy path
const reg = { p_name: "QA-T Lotus Society", p_address_line: "12 QA Test Road", p_city: "Pune", p_state: "Maharashtra", p_pincode: "411001",
  p_landmark: null, p_authorities: [], p_request_id: reqId, p_registration_number: "QA-T-LOTUS-" + Date.now(), p_society_type: null,
  p_registration_date: null, p_official_email: null, p_official_phone: null, p_country: null, p_features: null };
r = await rpc(m7, "admin_register_society", reg);
record("TC-API-023", A, "admin_register_society as non-staff", "NOT_PLATFORM_STAFF", r, code(r) === "NOT_PLATFORM_STAFF");
r = await rpc(admin, "admin_register_society", { ...reg, p_pincode: "011001" });
record("TC-API-024", A, "register: pincode starting 0", "INVALID_PINCODE", r, code(r) === "INVALID_PINCODE");
r = await rpc(admin, "admin_register_society", { ...reg, p_features: ["parking"] });
record("TC-API-025", A, "register: feature without module", "UNKNOWN_FEATURE", r, code(r) === "UNKNOWN_FEATURE");
const before = sql("select count(*) from societies where name='QA-T Lotus Society'");
record("TC-DB-003", A, "DB: failed registrations created no society (atomic)", "0", before, before === "0");
r = await rpc(admin, "admin_register_society", { ...reg, p_features: ["bookings","polls","directory","flat_actions","community","moderation","visitors","staff_directory","facility_calendar"] });
record("TC-API-026", A, "register society from request", "200 society_id, code, authority_count 1", r, r.status === 200 && r.body?.authority_count === 1 && !!r.body?.code);
const soc = r.body;
r = await rpc(admin, "admin_register_society", reg);
record("TC-API-027", A, "register again from the same request", "REQUEST_ALREADY_REGISTERED (or duplicate reg no.)", r, ["REQUEST_ALREADY_REGISTERED","DUPLICATE_REGISTRATION_NUMBER"].includes(code(r)));
const st = sql(`select status, society_id from society_enrollment_requests where id='${reqId}'`);
record("TC-DB-004", A, "DB: request registered and linked", "registered|<society_id>", st, st === `registered|${soc?.society_id}`);
const auth = sql(`select count(*) , string_agg(phone, ',') from society_authorities where society_id='${soc?.society_id}'`);
record("TC-DB-005", A, "DB: authority row seeded from request contact", "1|9000000027", auth, auth === "1|9000000027");
writeFileSync("state.json", JSON.stringify({ reqCode, reqId, societyB: soc }, null, 1));
