import { login, rpc, short } from "./lib.mjs";
const admin = await login("9000000030");
const cat = await rpc(admin, "admin_feature_catalogue");
console.log(short(cat, 3000));
for (const [p, n] of [["9000000027","QA-T Chairman Lotus"],["9000000003","QA-T Treasurer Lotus"],["9000000004","QA-T Committee Lotus"],["9000000006","QA-T Guard Lotus"],["9000000007","QA-T Member Lotus"]]) {
  const s = await login(p);
  const st = await rpc(s, "my_login_state");
  console.log(p, short(st, 400));
  const up = await rpc(s, "upsert_my_profile", { p_full_name: n, p_signup_intent: null });
  console.log(" profile", short(up));
}
