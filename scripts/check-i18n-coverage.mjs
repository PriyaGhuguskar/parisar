#!/usr/bin/env node
// i18n coverage CI gate — Phase 7, Plan 07-01.
//
// For every namespace shard in packages/i18n/locales/ this script:
//   1. Loads en, hi, mr.
//   2. Flattens each to dotted-path keys (e.g. "tiles.myComplaints").
//   3. Asserts the three key sets are identical (no missing-locale gaps).
//   4. Asserts each key's `{{placeholder}}` set is identical across locales
//      (e.g. {{name}} present in all three or in none — a missing placeholder
//      in a single locale means an interpolation slot will leak as a literal
//      placeholder OR be silently dropped at runtime).
//
// Shards covered:
//   - 9 domain shards under locales/{en,hi,mr}/: dashboard, complaints,
//     notifications, polls, bookings, preferences, flat-actions, community,
//     moderation.
//   - The flat top-level <lng>.json (auth + setup + dashboard-legacy + removal
//     + roleTransfer + join + amenity + codeRotation + reviewQueue + directory).
//
// Exit code: 0 on success, 1 on any drift (with a grouped report on stderr).
//
// Usage: node scripts/check-i18n-coverage.mjs

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = path.resolve(process.cwd());
const LOCALE_DIR = path.join(REPO_ROOT, "packages/i18n/locales");
const LOCALES = ["en", "hi", "mr"];

const DOMAIN_SHARDS = [
  "dashboard",
  "complaints",
  "notifications",
  "polls",
  "bookings",
  "preferences",
  "flat-actions",
  "community",
  "moderation",
];

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

/**
 * Recursively flatten a nested JSON object into dotted-path keys.
 * Skips the `_meta` field (locale metadata, not user-facing strings).
 */
function flatten(obj, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "_meta") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flatten(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

function placeholdersIn(value) {
  if (typeof value !== "string") return new Set();
  const found = new Set();
  // Reset regex state per call (PLACEHOLDER_RE has /g).
  PLACEHOLDER_RE.lastIndex = 0;
  let match;
  while ((match = PLACEHOLDER_RE.exec(value)) !== null) {
    found.add(match[1]);
  }
  return found;
}

async function loadShard(locale, shardName) {
  const file = shardName === "auth"
    ? path.join(LOCALE_DIR, `${locale}.json`)
    : path.join(LOCALE_DIR, locale, `${shardName}.json`);

  let content;
  try {
    content = await fs.readFile(file, "utf-8");
  } catch (err) {
    throw new Error(`MISSING SHARD: ${file} — ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`INVALID JSON: ${file} — ${err.message}`);
  }
  return parsed;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function difference(a, b) {
  return [...a].filter((x) => !b.has(x));
}

async function checkShard(shardName) {
  const flats = {};
  for (const lng of LOCALES) {
    const data = await loadShard(lng, shardName);
    flats[lng] = flatten(data);
  }

  const keySets = Object.fromEntries(
    LOCALES.map((l) => [l, new Set(Object.keys(flats[l]))]),
  );

  const errors = [];

  // 1. Key parity across the three locales.
  if (!setsEqual(keySets.en, keySets.hi) || !setsEqual(keySets.en, keySets.mr)) {
    const missingInHi = difference(keySets.en, keySets.hi);
    const missingInMr = difference(keySets.en, keySets.mr);
    const extraInHi = difference(keySets.hi, keySets.en);
    const extraInMr = difference(keySets.mr, keySets.en);
    if (missingInHi.length) errors.push(`  hi MISSING ${missingInHi.length} keys: ${missingInHi.join(", ")}`);
    if (missingInMr.length) errors.push(`  mr MISSING ${missingInMr.length} keys: ${missingInMr.join(", ")}`);
    if (extraInHi.length) errors.push(`  hi has ${extraInHi.length} EXTRA keys not in en: ${extraInHi.join(", ")}`);
    if (extraInMr.length) errors.push(`  mr has ${extraInMr.length} EXTRA keys not in en: ${extraInMr.join(", ")}`);
  }

  // 2. Placeholder parity per key (only for keys present in all three locales).
  const common = [...keySets.en].filter(
    (k) => keySets.hi.has(k) && keySets.mr.has(k),
  );
  for (const key of common) {
    const phEn = placeholdersIn(flats.en[key]);
    const phHi = placeholdersIn(flats.hi[key]);
    const phMr = placeholdersIn(flats.mr[key]);
    if (!setsEqual(phEn, phHi) || !setsEqual(phEn, phMr)) {
      errors.push(
        `  PLACEHOLDER DRIFT @ ${key}: ` +
          `en={${[...phEn].join(",")}} hi={${[...phHi].join(",")}} mr={${[...phMr].join(",")}}`,
      );
    }
  }

  return errors;
}

async function main() {
  const allErrors = [];
  const shardsToCheck = [...DOMAIN_SHARDS, "auth"];

  for (const shard of shardsToCheck) {
    try {
      const errors = await checkShard(shard);
      if (errors.length > 0) {
        allErrors.push(`\nSHARD ${shard}:`);
        for (const e of errors) allErrors.push(e);
      } else {
        // biome-ignore lint/suspicious/noConsole: intentional CLI output
        console.log(`OK: ${shard} (en ≡ hi ≡ mr, placeholders match)`);
      }
    } catch (err) {
      allErrors.push(`\nSHARD ${shard}: ${err.message}`);
    }
  }

  if (allErrors.length > 0) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error("\ni18n coverage check FAILED:");
    for (const e of allErrors) {
      // biome-ignore lint/suspicious/noConsole: intentional CLI output
      console.error(e);
    }
    process.exit(1);
  }

  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.log("\ni18n coverage check PASSED.");
}

main().catch((err) => {
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error("Unexpected error:", err);
  process.exit(2);
});
