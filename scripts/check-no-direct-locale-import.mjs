#!/usr/bin/env node
// no-direct-locale-import CI gate — Phase 7, Plan 07-01.
//
// PURPOSE: After the Phase 7 retrofit completes, every app screen must read
// strings through `useTranslation(...)` + `t(...)`. A direct
//   import en from "@parisar/i18n/locales/dashboard.json"
// pattern means a developer accidentally regressed to the pre-retrofit code
// path — and CRITICALLY, that code path is en-only: the same screen will
// render English on a Hindi or Marathi device.
//
// THIS SCRIPT FAILS BY DESIGN UNTIL WAVE 2 COMPLETES.
//
// Wave 0 (this plan) introduces the script but does NOT wire it into the
// `i18n-gates` CI job — because today the app source tree still has 86+
// mobile files + 22+ web files using the pre-retrofit pattern. Running this
// in CI before Wave 2 lands would block every PR.
//
// PROMOTION SEQUENCE:
//   - Wave 0 (now):     Script lives in scripts/. CI does NOT call it.
//   - Wave 1 (i18n init+lib):  Apps gain the i18next runtime but legacy imports remain.
//   - Wave 2 (108-file retrofit): Every `import <lng> from "@parisar/i18n/locales/..."` is removed.
//   - Wave 2 final commit: ADD this script to the i18n-gates job in CI. From
//     that commit onward, any re-introduction of the pattern is a build break.
//
// USAGE: `node scripts/check-no-direct-locale-import.mjs`
//   Exit 0 → no offending imports found.
//   Exit 1 → at least one offender (printed file:line).

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = path.resolve(process.cwd());

// Default scope: only the app source trees that ship UI. Tests, scripts,
// packages (including @parisar/i18n itself) are exempt — the i18n package may
// import the JSON, and tests may pin against literal expected values.
const DEFAULT_SCAN_ROOTS = [
  "apps/mobile/app",
  "apps/mobile/components",
  "apps/mobile/lib",
  "apps/web/app",
  "apps/web/components",
  "apps/web/lib",
];

// Parse CLI: support `--dir <path>` (repeatable) to narrow the scan scope.
// Useful during the Phase 7 retrofit — Task 1 audits Group A subtrees first,
// Task 2 audits all of apps/mobile.
function parseScanRoots(argv) {
  const dirs = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir" && argv[i + 1]) {
      dirs.push(argv[i + 1]);
      i++;
    }
  }
  return dirs.length > 0 ? dirs : DEFAULT_SCAN_ROOTS;
}

const SCAN_ROOTS = parseScanRoots(process.argv.slice(2));

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".expo",
  "coverage",
  "__tests__",
  ".turbo",
  "dist",
  "build",
]);

// Match `import ... from "@parisar/i18n/locales/<anything>.json"` (single or double quotes).
const OFFENDER_RE = /from\s+["']@parisar\/i18n\/locales\/[^"']+\.json["']/;

async function walk(dir, out) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    // Directory doesn't exist yet (e.g. a scan root not created in early waves) — skip.
    if (err.code === "ENOENT") return;
    throw err;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (ext === ".js" || ext === ".jsx") {
        out.push(path.join(dir, entry.name));
      }
    }
  }
}

async function scan() {
  const files = [];
  for (const root of SCAN_ROOTS) {
    await walk(path.join(REPO_ROOT, root), files);
  }

  const offenders = [];
  for (const file of files) {
    const content = await fs.readFile(file, "utf-8");
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      if (OFFENDER_RE.test(line)) {
        offenders.push({
          file: path.relative(REPO_ROOT, file),
          line: idx + 1,
          source: line.trim(),
        });
      }
    });
  }
  return offenders;
}

async function main() {
  const offenders = await scan();

  if (offenders.length === 0) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log("no-direct-locale-import check PASSED — 0 offending files.");
    process.exit(0);
  }

  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(
    `\nno-direct-locale-import check FAILED — ${offenders.length} offending import(s):\n`,
  );
  for (const o of offenders) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error(`  ${o.file}:${o.line}: ${o.source}`);
  }
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(
    "\nFix: replace `import en from '@parisar/i18n/locales/<ns>.json'` with " +
      "`const { t } = useTranslation('<ns>')` + `t('key.path')`.",
  );
  process.exit(1);
}

main().catch((err) => {
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error("Unexpected error:", err);
  process.exit(2);
});
