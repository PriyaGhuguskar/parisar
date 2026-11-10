// Builds docs/qa outputs for the `roles` area from results.jsonl + hand-written JSON/MD parts.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
const REPO = "/home/nexapp/Documents/personal/parisar";
const Q = `${REPO}/docs/qa`;
mkdirSync(`${Q}/data`, { recursive: true }); mkdirSync(`${Q}/scripts/api`, { recursive: true });
const rows = new Map();
for (const l of readFileSync("results.jsonl", "utf8").split("\n").filter(Boolean)) { const o = JSON.parse(l); rows.set(o.id, o); }
const extra = existsSync("not_tested.json") ? JSON.parse(readFileSync("not_tested.json")) : [];
for (const o of extra) if (!rows.has(o.id)) rows.set(o.id, o);
const all = [...rows.values()];
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 300);
const AREA_TITLES = JSON.parse(readFileSync("areas.json"));
function table(list) {
  let t = "| ID | Title | Expected | Actual | Status |\n|---|---|---|---|---|\n";
  for (const o of list) t += `| ${o.id} | ${esc(o.title)} | ${esc(o.expected)} | ${esc(o.actual)} | ${o.status} |\n`;
  return t;
}
function section(list) {
  const byArea = {};
  for (const o of list) (byArea[o.area] ||= []).push(o);
  let md = "";
  for (const a of Object.keys(byArea)) md += `\n### ${AREA_TITLES[a] || a}\n\n${table(byArea[a])}`;
  return md;
}
const isRole = (o) => o.area.startsWith("role");
const roleList = all.filter(isRole), apiList = all.filter((o) => !isRole(o));
const cnt = (l) => ({ test_cases: l.length, passed: l.filter((o) => o.status === "Pass").length, failed: l.filter((o) => o.status === "Fail").length,
  blocked: l.filter((o) => o.status === "Blocked").length, not_tested: l.filter((o) => o.status === "Not Tested").length });
const cline = (c) => `Test cases: ${c.test_cases}. Passed: ${c.passed}. Failed: ${c.failed}. Blocked: ${c.blocked}. Not tested: ${c.not_tested}.`;
const bugs = JSON.parse(readFileSync("bugs.json"));
const bugMd = bugs.length ? "| ID | Severity | Title |\n|---|---|---|\n" + bugs.map((b) => `| ${b.id} | ${b.severity} | ${esc(b.title)} |`).join("\n") + "\n" : "None yet.\n";
const fill = (tpl, list) => readFileSync(tpl, "utf8")
  .replace("{{COUNTS}}", cline(cnt(list))).replace("{{TESTS}}", section(list)).replace("{{BUGS}}", bugMd)
  .replace("{{UPDATED}}", new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC")
  .replace("{{MATRIX}}", existsSync("matrix.md") ? readFileSync("matrix.md", "utf8") : "_Matrix not built yet._");
writeFileSync(`${Q}/PARISAR_ROLE_PERMISSION_TESTING.md`, fill("tpl_roles.md", roleList));
writeFileSync(`${Q}/PARISAR_API_DATABASE_TESTING.md`, fill("tpl_api.md", apiList));
writeFileSync(`${Q}/data/bugs-roles.json`, JSON.stringify(bugs, null, 2));
writeFileSync(`${Q}/data/features-roles.json`, readFileSync("features.json"));
writeFileSync(`${Q}/data/counts-roles.json`, JSON.stringify(cnt(all), null, 2));
for (const f of readdirSync(".")) if (/\.mjs$/.test(f)) copyFileSync(f, `${Q}/scripts/api/${f}`);
copyFileSync("results.jsonl", `${Q}/scripts/api/results-roles.jsonl`);
console.log("written", cnt(all));
