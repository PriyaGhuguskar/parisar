// Parses app/tokens.css and checks WCAG AA on every semantic pair, in both themes, so a
// colour tweak cannot quietly fail contrast.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(path.resolve(__dirname, "../../../app/tokens.css"), "utf8");

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  const body = css.slice(start, css.indexOf("\n  }", start));
  const entries = [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)];
  return Object.fromEntries(entries.map(([, name, value]) => [name, value]));
}

const light = block(":root");
const dark = { ...light, ...block(':root[data-theme="dark"]') };

function luminance(hex) {
  const channels = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5;
const NON_TEXT = 3;
const STATUSES = ["success", "warning", "danger", "info", "neutral"];

const PAIRS = [
  ["foreground", "background", TEXT],
  ["foreground", "card", TEXT],
  ["foreground", "muted", TEXT],
  ["card-foreground", "card", TEXT],
  ["popover-foreground", "popover", TEXT],
  ["muted-foreground", "background", TEXT],
  ["muted-foreground", "card", TEXT],
  ["muted-foreground", "muted", TEXT],
  ["primary-foreground", "primary", TEXT],
  ["primary-foreground", "primary-hover", TEXT],
  ["primary", "card", TEXT],
  ["primary", "background", TEXT],
  ["primary-soft-foreground", "primary-soft", TEXT],
  ["secondary-foreground", "secondary", TEXT],
  ["accent-foreground", "accent", TEXT],
  ["destructive-foreground", "destructive", TEXT],
  ["destructive", "card", TEXT],
  ["destructive", "background", TEXT],
  ["sidebar-foreground", "sidebar", TEXT],
  ["sidebar-primary-foreground", "sidebar-primary", TEXT],
  ["sidebar-accent-foreground", "sidebar-accent", TEXT],
  ["input", "card", NON_TEXT],
  ["input", "background", NON_TEXT],
  ["ring", "card", NON_TEXT],
  ["ring", "background", NON_TEXT],
  ...STATUSES.flatMap((s) => [
    [`status-${s}-fg`, `status-${s}-bg`, TEXT],
    [`status-${s}-solid`, "card", NON_TEXT],
    [`status-${s}-solid`, `status-${s}-bg`, NON_TEXT],
  ]),
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (_name, theme) => {
  it.each(PAIRS)("%s on %s reaches %d:1", (fg, bg, minimum) => {
    expect(theme[fg], fg).toBeDefined();
    expect(theme[bg], bg).toBeDefined();
    expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(minimum);
  });
});

describe("brand", () => {
  it("keeps the Parisar colours from packages/ui-tokens", async () => {
    const { colors } = await import("@parisar/ui-tokens");
    expect(light["color-brand-500"].toLowerCase()).toBe(colors.brand[500].toLowerCase());
    expect(light["color-brand-50"].toLowerCase()).toBe(colors.brand[50].toLowerCase());
    expect(light["color-neutral-900"].toLowerCase()).toBe(colors.neutral[900].toLowerCase());
    expect(light.primary.toLowerCase()).toBe(colors.brand[500].toLowerCase());
  });

  it("uses Inter first, then Noto Sans Devanagari", () => {
    expect(css).toMatch(/--font-sans: var\(--font-inter\), var\(--font-noto-devanagari\)/);
  });
});
