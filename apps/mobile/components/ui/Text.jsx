// Shared <Text> — React Native Text with the bundled Noto Sans font applied.
//
// RN has no global default font and Text does not inherit fontFamily from a
// parent View, and React 19 dropped defaultProps for function components, so
// the reliable way to make every label render in the bundled fonts is a thin
// wrapper. It picks Noto Sans Devanagari for Hindi/Marathi (budget Android
// ROMs render Devanagari conjuncts inconsistently with the device font) and
// Noto Sans otherwise, choosing the 600 weight for font-semibold/font-bold.
//
// Usage: `import { Text } from "../ui/Text";` — a drop-in replacement for the
// react-native export. An explicit `style={{ fontFamily }}` (e.g. monospace
// society codes) or a family class (`font-mono`, `font-sans`,
// `font-devanagari`, `font-[...]` from tailwind.config.js) always wins.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { Text as RNText, StyleSheet } from "react-native";
import { resolveFontFamily } from "../../lib/fonts";
import { useAppLanguage } from "../hooks/use-app-language";

const SEMIBOLD_CLASS_RE = /(^|\s)(?:[a-z]+:)?font-(semibold|bold|extrabold|black)(\s|$)/;
const EXPLICIT_FAMILY_CLASS_RE = /(^|\s)font-(mono|serif|sans|devanagari|\[)/;
const SEMIBOLD_WEIGHTS = new Set(["600", "700", "800", "900", "bold"]);

function wantsSemibold(className, flatStyle) {
  const weight = flatStyle?.fontWeight;
  if (weight != null) return SEMIBOLD_WEIGHTS.has(String(weight));
  return typeof className === "string" && SEMIBOLD_CLASS_RE.test(className);
}

/**
 * @param {import("react-native").TextProps & { className?: string }} props
 */
export function Text({ className, style, ...rest }) {
  const lng = useAppLanguage();
  const flat = StyleSheet.flatten(style);
  const hasExplicitFamily =
    !!flat?.fontFamily ||
    (typeof className === "string" && EXPLICIT_FAMILY_CLASS_RE.test(className));

  if (hasExplicitFamily) {
    return <RNText className={className} style={style} {...rest} />;
  }

  // The weight lives in the font file, so reset fontWeight to stop Android
  // from synthesising a faux-bold on top of the 600 face.
  const fontStyle = {
    fontFamily: resolveFontFamily(lng, wantsSemibold(className, flat)),
    fontWeight: "normal",
  };
  return (
    <RNText className={className} style={flat ? { ...flat, ...fontStyle } : fontStyle} {...rest} />
  );
}
