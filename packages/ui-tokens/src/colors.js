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
    // Deep garden green. Clears 4.5:1 on white (5.94:1) AND behind white text
    // (5.94:1), so it is safe for text and for button fills alike.
    500: "#12715A", // on white 5.94:1 · white on fill 5.94:1
    600: "#0E5A48", // hover / stronger text — on white 8.03:1
    700: "#0A4436", // text on brand-50 tint — on white 10.4:1
  },
  neutral: {
    0: "#ffffff",
    50: "#FFFDF9",
    100: "#EEF6F0",
    200: "#DDE9E0", // borders/dividers only — never text
    400: "#627368", // green-biased grey. 5.03:1 on white · 4.57:1 on neutral-100.
    600: "#4A5C50",
    900: "#12261C",
  },
  success: { 500: "#12715A" }, // matches brand-500 — success IS the brand hue here
  warning: {
    500: "#f59e0b", // fill/border only — pair with neutral-900 text (8.35:1)
    700: "#b45309", // text on amber tint 4.84:1 / on white 5.02:1
  },
  danger: { 500: "#c81e1e" }, // was #ef4444 (3.76:1 white-on-fill). Now 5.74:1
};
