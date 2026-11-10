// Dashboard + list read mix for signed-in residents/authorities (READ ONLY).
// Run: k6 run -e TARGET_VUS=500 -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e TOKENS_FILE=tokens.json read-mix.js
import { sleep, group } from "k6";
import { rpc, rest, tokenForVu, stagedOptions, SOCIETY_ID } from "./lib.js";

export const options = stagedOptions(100);

export default function () {
  const t = tokenForVu();
  group("dashboard", () => {
    rpc("resident_dashboard", { p_society_id: SOCIETY_ID }, t);
    rpc("my_society_features", { p_society_id: SOCIETY_ID }, t);
  });
  sleep(1 + Math.random() * 2);
  group("lists", () => {
    rest("complaints?select=id,kind,description,status,created_at&order=created_at.desc&limit=20", t);
    rest("notifications?select=id,title,created_at&order=created_at.desc&limit=20", t);
    rest("posts?select=id,body,created_at&order=created_at.desc&limit=20", t);
    rest("amenities?select=id,name&limit=50", t);
  });
  sleep(2 + Math.random() * 3); // think time
}
