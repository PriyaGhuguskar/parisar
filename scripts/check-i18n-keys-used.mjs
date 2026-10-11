#!/usr/bin/env node
// CI gate: every literal i18n key used by the apps must exist in the English
// locale (packages/i18n/locales/en). Catches typo'd keys and keys added in code
// before their locale JSON was merged — which otherwise render as raw key text,
// because the runtime (and the unit-test mocks outside I18N_STRICT) fall back to
// the key itself.
//
// What it scans: apps/web and apps/mobile source (.js/.jsx), excluding tests,
// node_modules, build output and native folders. For every literal call
//   t("key") / t('key') / t(`key`)        (no ${} interpolation)
// it resolves the namespace:
//   - "ns:dotted.key"  → that namespace explicitly;
//   - otherwise        → the namespaces the file passes to useTranslation(...) /
//                        getServerT(...). A file with no namespace information
//                        (t received as a prop, or useTranslation() with no args)
//                        is checked against ALL namespaces.
// Namespace "auth" is the flat top-level en.json; the others are en/<ns>.json.
//
// Dynamic keys (t(`status.${x}`), t(variable)) cannot be checked statically and are
// skipped; the I18N_STRICT=1 unit-test mode covers the ones the tests render.
//
// Usage: node scripts/check-i18n-keys-used.mjs [--dir apps]
// Exit code 1 when any key is missing.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCALE_DIR = path.join(ROOT, "packages", "i18n", "locales");
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".expo",
  ".turbo",
  "android",
  "ios",
  "dist",
  "build",
  "coverage",
  "__tests__",
  ".maestro",
]);
const SOURCE_RE = /\.(js|jsx)$/;
const TEST_FILE_RE = /\.(test|spec)\.(js|jsx)$/;

const NS_CALL_RE = /\b(?:useTranslation|getServerT)\(\s*(\[[^\]]*\]|"[^"]*"|'[^']*')?/g;
const T_CALL_RE = /(?<![\w$])t\(\s*(?:"([^"\n]+)"|'([^'\n]+)'|`([^`$\n]+)`)/g;
const KEY_RE = /^[A-Za-z0-9_-]+(?::[A-Za-z0-9_.-]+|(?:\.[A-Za-z0-9_-]+)*)$/;

function parseArgs(argv) {
  const dirIdx = argv.indexOf("--dir");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : "apps";
  return { dir: path.resolve(ROOT, dir) };
}

function loadShards() {
  const shards = { auth: JSON.parse(readFileSync(path.join(LOCALE_DIR, "en.json"), "utf8")) };
  for (const file of readdirSync(path.join(LOCALE_DIR, "en"))) {
    if (!file.endsWith(".json")) continue;
    shards[file.replace(/\.json$/, "")] = JSON.parse(
      readFileSync(path.join(LOCALE_DIR, "en", file), "utf8"),
    );
  }
  return shards;
}

function hasPath(obj, dotted) {
  let cur = obj;
  for (const seg of dotted.split(".")) {
    if (cur && typeof cur === "object" && Object.hasOwn(cur, seg)) cur = cur[seg];
    else return false;
  }
  // A key may resolve to a string, or to a plural/context object (key_one, ...).
  return typeof cur === "string";
}

function hasPluralForm(obj, dotted) {
  const idx = dotted.lastIndexOf(".");
  const parentPath = idx >= 0 ? dotted.slice(0, idx) : "";
  const leaf = idx >= 0 ? dotted.slice(idx + 1) : dotted;
  let parent = obj;
  if (parentPath) {
    for (const seg of parentPath.split(".")) {
      if (parent && typeof parent === "object" && Object.hasOwn(parent, seg)) parent = parent[seg];
      else return false;
    }
  }
  if (!parent || typeof parent !== "object") return false;
  return Object.keys(parent).some((k) => k.startsWith(`${leaf}_`) && typeof parent[k] === "string");
}

function keyExists(shards, ns, dotted) {
  const shard = shards[ns];
  if (!shard) return false;
  return hasPath(shard, dotted) || hasPluralForm(shard, dotted);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SOURCE_RE.test(name) && !TEST_FILE_RE.test(name)) out.push(full);
  }
  return out;
}

function fileNamespaces(src) {
  const namespaces = new Set();
  let hasUnscoped = false;
  for (const m of src.matchAll(NS_CALL_RE)) {
    const arg = m[1];
    if (!arg) {
      hasUnscoped = true;
      continue;
    }
    for (const lit of arg.matchAll(/["']([^"']+)["']/g)) namespaces.add(lit[1]);
  }
  return { namespaces: [...namespaces], hasUnscoped };
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

function checkFile(file, shards) {
  const src = readFileSync(file, "utf8");
  const { namespaces, hasUnscoped } = fileNamespaces(src);
  const allNs = Object.keys(shards);
  const searchNs = namespaces.length > 0 && !hasUnscoped ? namespaces : allNs;
  const missing = [];

  for (const m of src.matchAll(T_CALL_RE)) {
    const key = m[1] ?? m[2] ?? m[3];
    if (!KEY_RE.test(key)) continue;
    const line = lineOf(src, m.index);

    if (key.includes(":")) {
      const [ns, rest] = key.split(":", 2);
      if (!keyExists(shards, ns, rest)) missing.push({ line, key, where: ns });
      continue;
    }
    if (searchNs.some((ns) => keyExists(shards, ns, key))) continue;
    const elsewhere = allNs.filter((ns) => keyExists(shards, ns, key));
    missing.push({
      line,
      key,
      where: searchNs.join(","),
      hint: elsewhere.length > 0 ? `exists in ${elsewhere.join(",")} — wrong namespace?` : null,
    });
  }
  return missing;
}

function main() {
  const { dir } = parseArgs(process.argv.slice(2));
  const shards = loadShards();
  const files = walk(dir);
  let total = 0;
  const report = [];

  for (const file of files) {
    const missing = checkFile(file, shards);
    if (missing.length === 0) continue;
    total += missing.length;
    report.push(`\n${path.relative(ROOT, file).replaceAll("\\", "/")}`);
    for (const m of missing) {
      report.push(`  L${m.line}  ${m.key}  [${m.where}]${m.hint ? `  (${m.hint})` : ""}`);
    }
  }

  if (total === 0) {
    process.stdout.write(`check-i18n-keys-used: OK — ${files.length} files scanned.\n`);
    return;
  }
  process.stderr.write(
    `check-i18n-keys-used: ${total} missing key(s) in packages/i18n/locales/en${report.join("\n")}\n`,
  );
  process.exitCode = 1;
}

main();
