#!/usr/bin/env node
// Devanagari locale-bundle integrity check.
//
// Verifies that hi.json and mr.json contain at least one character in the Devanagari
// Unicode block (U+0900–U+097F). Catches encoding regressions, accidental ASCII-fication,
// or copy-paste mistakes that strip the script.
//
// Phase 7, Plan 07-01 EXTENSION: also scans every hi/mr shard under
// packages/i18n/locales/{hi,mr}/*.json and reports the Devanagari code-point coverage
// (the set of distinct U+0900–U+097F code points actually used). The floor is
// non-zero — any merge that empties Devanagari content from the locale fails CI.
// (The font-file-byte scan that would assert the bundled Noto Sans Devanagari font
// covers exactly the same code points is out of scope for v1; this content-side
// coverage assertion is the RESEARCH.md §Validation floor.)
//
// Usage: node scripts/check-devanagari-bundle.mjs

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = path.resolve(process.cwd());
const LOCALE_DIR = path.join(REPO_ROOT, "packages/i18n/locales");
const REQUIRED_DEVANAGARI_LOCALES = ["hi.json", "mr.json"];

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

// Devanagari Unicode block: U+0900 to U+097F (decimal 2304 to 2431).
const DEVANAGARI_RANGE = /[ऀ-ॿ]/;

function collectDevanagariCodePoints(value, sink) {
  if (typeof value === "string") {
    for (const ch of value) {
      const cp = ch.codePointAt(0);
      if (cp != null && cp >= 0x0900 && cp <= 0x097f) {
        sink.add(cp);
      }
    }
  } else if (Array.isArray(value)) {
    for (const v of value) collectDevanagariCodePoints(v, sink);
  } else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) collectDevanagariCodePoints(v, sink);
  }
}

async function main() {
  const errors = [];

  for (const file of REQUIRED_DEVANAGARI_LOCALES) {
    const fullPath = path.join(LOCALE_DIR, file);
    let content;
    try {
      content = await fs.readFile(fullPath, "utf-8");
    } catch (err) {
      errors.push(`MISSING: ${fullPath} — ${err.message}`);
      continue;
    }

    // Must be valid JSON.
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      errors.push(`INVALID JSON: ${fullPath} — ${err.message}`);
      continue;
    }

    // Must contain at least one Devanagari character somewhere in the values.
    const flatValues = JSON.stringify(parsed);
    if (!DEVANAGARI_RANGE.test(flatValues)) {
      errors.push(
        `NO DEVANAGARI: ${file} contains zero characters in the U+0900–U+097F range. ` +
          `The Devanagari content (e.g. "परिसर") may have been replaced with ASCII transliteration.`,
      );
      continue;
    }

    // Sanity: file size should be > 80 bytes (a meaningful skeleton, not just `{}`).
    const stat = await fs.stat(fullPath);
    if (stat.size < 80) {
      errors.push(
        `SUSPICIOUS SIZE: ${file} is only ${stat.size} bytes — locale skeleton may have been truncated.`,
      );
    }

    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log(`OK: ${file} (${stat.size} bytes, contains valid Devanagari)`);
  }

  // ---- Phase 7 extension: Devanagari code-point coverage across all hi/mr shards. ----
  // Walk every Devanagari character used in hi.json + mr.json (flat + per-domain shards)
  // and assert the coverage set is non-empty. Logs the distinct code-point count so a
  // future font-byte scan can compare against it.
  const coverage = new Set();

  for (const locale of ["hi", "mr"]) {
    // Flat top-level shard.
    const flatPath = path.join(LOCALE_DIR, `${locale}.json`);
    try {
      const data = JSON.parse(await fs.readFile(flatPath, "utf-8"));
      collectDevanagariCodePoints(data, coverage);
    } catch (err) {
      errors.push(`COVERAGE LOAD FAILED: ${flatPath} — ${err.message}`);
    }

    // Per-domain shards.
    for (const ns of DOMAIN_SHARDS) {
      const file = path.join(LOCALE_DIR, locale, `${ns}.json`);
      try {
        const data = JSON.parse(await fs.readFile(file, "utf-8"));
        collectDevanagariCodePoints(data, coverage);
      } catch (err) {
        errors.push(`COVERAGE LOAD FAILED: ${file} — ${err.message}`);
      }
    }
  }

  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.log(
    `\nDevanagari code-point coverage (across all hi/mr shards): ${coverage.size} distinct code points in U+0900–U+097F.`,
  );

  if (coverage.size === 0) {
    errors.push(
      "ZERO DEVANAGARI COVERAGE: across all hi/mr shards no Devanagari code points were found. " +
        "This is a regression — the locales should cover at least the consonants + matras used " +
        "in the existing translations.",
    );
  }

  if (errors.length > 0) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error("\nDevanagari bundle check FAILED:");
    for (const e of errors) {
      // biome-ignore lint/suspicious/noConsole: intentional CLI output
      console.error("  - " + e);
    }
    process.exit(1);
  }

  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.log("\nDevanagari bundle check PASSED.");
}

main().catch((err) => {
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error("Unexpected error:", err);
  process.exit(2);
});
