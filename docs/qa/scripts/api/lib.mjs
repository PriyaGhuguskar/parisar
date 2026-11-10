// Parisar QA harness (roles/API area). Keys come from `supabase status -o env` at
// runtime; nothing secret is stored in this file. Sessions are cached in
// ./.sessions.json (scratchpad only) because GoTrue allows 10 sign-ins / 5 min / IP.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.PARISAR_REPO || "/home/nexapp/Documents/personal/parisar";
const SESS = join(HERE, ".sessions.json");
export const RESULTS = process.env.QA_RESULTS || join(HERE, "results.jsonl");

let ENV;
export function env() {
  if (ENV) return ENV;
  const out = execSync("supabase status -o env", { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] }).toString();
  ENV = {};
  for (const line of out.split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) ENV[m[1]] = m[2];
  }
  return ENV;
}
const base = () => env().API_URL;
const anon = () => env().ANON_KEY;

async function jfetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function loadSess() { return existsSync(SESS) ? JSON.parse(readFileSync(SESS, "utf8")) : {}; }
function saveSess(s) { writeFileSync(SESS, JSON.stringify(s, null, 1)); }

/** OTP sign-in (dev test numbers accept 123456). Reuses / refreshes cached sessions. */
export async function login(phone10, { fresh = false } = {}) {
  const phone = `+91${phone10}`;
  const all = loadSess();
  const c = all[phone10];
  const now = Math.floor(Date.now() / 1000);
  if (!fresh && c && c.expires_at - 120 > now) return c;
  if (!fresh && c?.refresh_token) {
    const r = await refresh(c);
    if (r) return r;
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const o = await jfetch(`${base()}/auth/v1/otp`, {
      method: "POST", headers: { apikey: anon(), "content-type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    if (o.status >= 400 && o.status !== 429) throw new Error(`otp ${phone10}: ${o.status} ${JSON.stringify(o.body)}`);
    const v = await jfetch(`${base()}/auth/v1/verify`, {
      method: "POST", headers: { apikey: anon(), "content-type": "application/json" },
      body: JSON.stringify({ phone, token: "123456", type: "sms" }),
    });
    if (v.status === 200) {
      const s = { phone10, access_token: v.body.access_token, refresh_token: v.body.refresh_token,
        expires_at: v.body.expires_at, user_id: v.body.user.id };
      all[phone10] = s; saveSess(all); return s;
    }
    if (v.status === 429 || o.status === 429) { await sleep(65000); continue; }
    throw new Error(`verify ${phone10}: ${v.status} ${JSON.stringify(v.body)}`);
  }
  throw new Error(`login ${phone10}: rate limited`);
}

/** Refresh so the Auth Hook re-issues society_id / role claims. */
export async function refresh(s) {
  const r = await jfetch(`${base()}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST", headers: { apikey: anon(), "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (r.status !== 200) return null;
  const n = { phone10: s.phone10, access_token: r.body.access_token, refresh_token: r.body.refresh_token,
    expires_at: r.body.expires_at, user_id: r.body.user.id };
  const all = loadSess(); all[s.phone10] = n; saveSess(all);
  return n;
}

export async function logout(s) {
  return jfetch(`${base()}/auth/v1/logout`, { method: "POST", headers: { apikey: anon(), authorization: `Bearer ${s.access_token}` } });
}

function hdrs(s, extra = {}) {
  const h = { apikey: anon(), "content-type": "application/json", ...extra };
  if (s === "anon") h.authorization = `Bearer ${anon()}`;
  else if (s && s.access_token) h.authorization = `Bearer ${s.access_token}`;
  else if (typeof s === "string" && s !== "none") h.authorization = `Bearer ${s}`;
  return h;
}

/** s: session | "anon" (anon key as bearer) | "none" (apikey only) | raw token string */
export async function rpc(s, name, args = {}) {
  return jfetch(`${base()}/rest/v1/rpc/${name}`, { method: "POST", headers: hdrs(s), body: JSON.stringify(args) });
}
export async function rest(s, method, path, body, extra = {}) {
  return jfetch(`${base()}/rest/v1/${path}`, {
    method, headers: hdrs(s, { prefer: "return=representation", ...extra }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
export async function noKey(path, method = "POST", body = {}) {
  return jfetch(`${base()}/rest/v1/${path}`, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(body) });
}

/** Read-only SQL. Refuses anything that is not a SELECT/WITH. */
export function sql(q) {
  if (!/^\s*(select|with)\b/i.test(q) || /;\s*\S/.test(q.trim().replace(/;$/, ""))) throw new Error("read-only select only");
  return execSync(`docker exec -i supabase_db_parisar psql -U postgres -d postgres -At -F '|' -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
}

/** Error code from an RPC response (raised error message or returned { error }). */
export function code(r) {
  if (!r) return null;
  const b = r.body;
  if (b && typeof b === "object" && !Array.isArray(b)) {
    if (b.message && r.status >= 400) return String(b.message).split(":")[0];
    if (b.error) return String(b.error).split(":")[0];
  }
  return null;
}
export function short(r, n = 220) {
  const s = JSON.stringify(r.body);
  return `${r.status} ${s && s.length > n ? s.slice(0, n) + "..." : s}`;
}

/** Record one executed check. pass = boolean. */
export function record(id, area, title, expected, r, pass, extra = {}) {
  const row = { id, area, title, expected, actual: typeof r === "string" ? r : short(r), status: pass ? "Pass" : "Fail", ...extra, at: new Date().toISOString() };
  appendFileSync(RESULTS, JSON.stringify(row) + "\n");
  console.log(`${row.status.padEnd(4)} ${id} ${title} -> ${row.actual.slice(0, 160)}`);
  return row;
}
export const denied = (r, codes) => r.status >= 400 || (codes && codes.includes(code(r))) || (r.body && r.body.error);
