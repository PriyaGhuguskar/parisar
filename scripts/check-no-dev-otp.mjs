#!/usr/bin/env node
// check-no-dev-otp.mjs — fail the build if dev-only OTP settings could reach a
// deployed Supabase project.
//
// The local supabase/config.toml deliberately carries dev-only auth settings
// ([auth.sms.test_otp] fixed codes and the dev_send_sms Postgres hook). They
// are safe ONLY while that file is used against the local stack. This gate
// fails when any of these would push them to a real project:
//
//   1. A [remotes.<name>] section exists in supabase/config.toml while the base
//      file still has test_otp / dev_send_sms (remotes inherit the base config),
//      or the remote section itself contains them.
//   2. Another config file (supabase/config.*.toml, supabase/*/config.toml)
//      contains test_otp / dev_send_sms / dev_peek_otp.
//   3. A GitHub workflow runs `supabase config push` while the base file still
//      has the dev settings.
//   4. `--deploy` is passed (use it as the last step before a manual
//      `supabase config push`): the base file itself must be clean.
//
// Usage: node scripts/check-no-dev-otp.mjs [--deploy]
// Exit code 0 = clean, 1 = dev OTP would be deployed.
//
// JavaScript only (Node ESM, no dependencies).

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SUPABASE_DIR = join(ROOT, "supabase");
const BASE_CONFIG = join(SUPABASE_DIR, "config.toml");
const WORKFLOWS_DIR = join(ROOT, ".github", "workflows");
const IS_DEPLOY = process.argv.includes("--deploy");

const DEV_MARKERS = [
  { re: /^\s*\[\s*(remotes\.[^\]]+\.)?auth\.sms\.test_otp\s*\]/m, label: "[auth.sms.test_otp]" },
  { re: /dev_send_sms/, label: "dev_send_sms hook" },
  { re: /dev_peek_otp/, label: "dev_peek_otp" },
];
const CONFIG_PUSH_RE = /supabase\s+config\s+push/;

function read(path) {
  return readFileSync(path, "utf8");
}

// Strip `#` comments so documentation that mentions the markers does not count.
function stripComments(toml) {
  return toml
    .split(/\r?\n/)
    .map((line) => {
      const hash = line.indexOf("#");
      return hash === -1 ? line : line.slice(0, hash);
    })
    .join("\n");
}

function devMarkersIn(text) {
  const clean = stripComments(text);
  return DEV_MARKERS.filter((m) => m.re.test(clean)).map((m) => m.label);
}

// Split a TOML document into { header, body } sections (header "" = preamble).
function sections(toml) {
  const out = [];
  let current = { header: "", body: [] };
  for (const line of stripComments(toml).split("\n")) {
    const m = line.match(/^\s*\[\s*([^\]]+?)\s*\]\s*$/);
    if (m) {
      out.push(current);
      current = { header: m[1], body: [] };
    } else {
      current.body.push(line);
    }
  }
  out.push(current);
  return out.map((s) => ({ header: s.header, body: s.body.join("\n") }));
}

function listFiles(dir, predicate, depth = 2) {
  if (!existsSync(dir) || depth < 0) return [];
  const found = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      found.push(...listFiles(full, predicate, depth - 1));
    } else if (predicate(full, name)) {
      found.push(full);
    }
  }
  return found;
}

function checkRemotes(baseText, baseMarkers, errors) {
  const remoteSections = sections(baseText).filter((s) => s.header.startsWith("remotes."));
  const remoteNames = new Set(remoteSections.map((s) => s.header.split(".")[1]));
  for (const name of remoteNames) {
    if (baseMarkers.length > 0) {
      errors.push(
        `supabase/config.toml defines [remotes.${name}] but the base config still has ${baseMarkers.join(", ")}; remotes inherit it`,
      );
    }
  }
  for (const s of remoteSections) {
    const inRemote = devMarkersIn(`[${s.header}]\n${s.body}`);
    if (inRemote.length > 0) {
      errors.push(`[${s.header}] contains ${inRemote.join(", ")}`);
    }
  }
}

function checkOtherConfigs(errors) {
  const others = listFiles(
    SUPABASE_DIR,
    (full, name) => full !== BASE_CONFIG && /^config(\..+)?\.toml$/.test(name) && !full.includes(`${join("supabase", "functions")}`),
  );
  for (const file of others) {
    const markers = devMarkersIn(read(file));
    if (markers.length > 0) {
      errors.push(`${relative(ROOT, file)} contains ${markers.join(", ")}`);
    }
  }
}

function checkWorkflows(baseMarkers, errors) {
  const workflows = listFiles(WORKFLOWS_DIR, (_full, name) => /\.ya?ml$/.test(name), 0);
  for (const file of workflows) {
    const text = read(file);
    if (CONFIG_PUSH_RE.test(text) && baseMarkers.length > 0) {
      errors.push(
        `${relative(ROOT, file)} runs \`supabase config push\` while supabase/config.toml has ${baseMarkers.join(", ")}`,
      );
    }
  }
}

function main() {
  if (!existsSync(BASE_CONFIG)) {
    console.error("check-no-dev-otp: supabase/config.toml not found");
    process.exit(1);
  }
  const baseText = read(BASE_CONFIG);
  const baseMarkers = devMarkersIn(baseText);
  const errors = [];

  checkRemotes(baseText, baseMarkers, errors);
  checkOtherConfigs(errors);
  checkWorkflows(baseMarkers, errors);
  if (IS_DEPLOY && baseMarkers.length > 0) {
    errors.push(`--deploy: supabase/config.toml still has ${baseMarkers.join(", ")}`);
  }

  if (errors.length > 0) {
    console.error("check-no-dev-otp: FAIL — dev OTP settings would reach a deployed project:");
    for (const e of errors) console.error(`  - ${e}`);
    console.error("See supabase/DEPLOY.md for the pre-deploy steps.");
    process.exit(1);
  }

  const note = baseMarkers.length > 0 ? ` (local-only dev settings present: ${baseMarkers.join(", ")})` : "";
  process.stdout.write(`check-no-dev-otp: OK${note}\n`);
}

main();
