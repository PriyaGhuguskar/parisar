// Cross-platform color tokens. Plain JS — no React, no platform deps.
// Both apps consume these to build their own Tailwind / NativeWind theme.

// WARM PALETTE. Re-derived when the product moved from a cool indigo brand to a
// warm marigold one so the app matches the public site — a visitor should not
// hit a colour cliff between the landing page and the login screen.
//
// WCAG 2.2 AA verified against the warm surfaces (white, neutral-50 #FFFCF9,
// neutral-100 #EEF6F0, brand-50 #DCEFE6). Ratios recorded per token so future
// edits can be checked rather than guessed.
export const colors = {
  brand: {
    50: "#DCEFE6",
    200: "#A8D8C4", // decorative borders only — never text
    // Deep garden green. Clears 4.5:1 on white (5.94:1) AND behind white text
    // (5.94:1), so it is safe for text and for button fills alike.
    500: "#12715A", // on white 5.94:1 · white on fill 5.94:1
    600: "#0E5A48", // hover / stronger text — on white 8.03:1
    700: "#0A4436", // text on brand-50 tint — on white 10.4:1
  },
  // SLATE neutrals — the same values as the website (apps/web/app/globals.css
  // --color-neutral-*), so both apps share one grey scale.
  neutral: {
    0: "#ffffff",
    50: "#F8FAFC", // page background
    100: "#F1F5F9",
    200: "#E2E8F0", // borders/dividers only — never text
    300: "#CBD5E1", // decorative only — never text
    400: "#64748B", // secondary text — 4.76:1 on white
    500: "#64748B",
    600: "#475569", // body text — 7.58:1 on white
    700: "#334155",
    900: "#1E293B", // headings — 14.6:1 on white
  },
  success: { 500: "#12715A" }, // matches brand-500 — success IS the brand hue here
  warning: {
    500: "#f59e0b", // fill/border only — pair with neutral-900 text (8.35:1)
    700: "#b45309", // text on amber tint 4.84:1 / on white 5.02:1
  },
  danger: {
    50: "#FCE9E6", // error-banner tint
    200: "#F5B8AD", // error-banner border
    500: "#c81e1e", // 5.74:1 on white
    700: "#94291A", // text on danger-50
  },
};
