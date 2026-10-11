const { colors, spacing } = require("@parisar/ui-tokens");

// Bundled font families (expo-font config plugin in app.config.js registers
// them by file name on Android). Keep in sync with lib/fonts.js. Most text gets
// its family automatically from components/ui/Text.jsx (language-aware); these
// utilities are for explicit overrides, e.g. `font-devanagari` on a label that
// is always Devanagari regardless of the UI language.
const FONT_REGULAR = "NotoSans_400Regular";
const FONT_SEMIBOLD = "NotoSans_600SemiBold";
const FONT_DEVANAGARI_REGULAR = "NotoSansDevanagari_400Regular";
const FONT_DEVANAGARI_SEMIBOLD = "NotoSansDevanagari_600SemiBold";

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: colors.brand,
        neutral: colors.neutral,
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
      },
      fontFamily: {
        sans: [FONT_REGULAR],
        "sans-semibold": [FONT_SEMIBOLD],
        devanagari: [FONT_DEVANAGARI_REGULAR],
        "devanagari-semibold": [FONT_DEVANAGARI_SEMIBOLD],
      },
      spacing: {
        0: spacing[0],
        1: spacing[1],
        2: spacing[2],
        3: spacing[3],
        4: spacing[4],
        6: spacing[6],
        8: spacing[8],
        12: spacing[12],
        16: spacing[16],
      },
    },
  },
  plugins: [],
};
