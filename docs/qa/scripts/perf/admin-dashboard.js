// Society admin / authority dashboard + resident access lists (READ ONLY).
// TOKENS_FILE must hold authority (secretary) tokens.
import { sleep } from "k6";
import { rpc, rest, tokenForVu, stagedOptions, SOCIETY_ID } from "./lib.js";

export const options = stagedOptions(50);

export default function () {
  const t = tokenForVu();
  rpc("society_admin_dashboard", { p_society_id: SOCIETY_ID }, t);
  rpc("manager_list_society_residents", { p_society_id: SOCIETY_ID, p_limit: 25, p_offset: 0 }, t, "rpc:manager_list_society_residents");
  rest("society_memberships?select=id,role,resident_type,flat_id&limit=50", t);
  rest("visitor_requests?select=id,status,created_at&order=created_at.desc&limit=20", t);
  sleep(3 + Math.random() * 4);
}
