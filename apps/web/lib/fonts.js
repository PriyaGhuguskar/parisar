import localFont from "next/font/local";
import {
  IBM_Plex_Mono,
  Manrope,
  Noto_Sans,
  Noto_Sans_Devanagari,
  Noto_Serif,
  Noto_Serif_Devanagari,
} from "next/font/google";

// Latin (en). Devanagari (hi, mr). Self-hosted via next/font — no Google CDN, no FOUT.
export const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-noto-sans",
  display: "swap",
});

export const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "600"],
  variable: "--font-noto-devanagari",
  display: "swap",
});

// Display face for the public landing page. Noto Serif is chosen deliberately
// over a decorative display font because it has a real Devanagari sibling — so a
// Hindi/Marathi headline renders in a MATCHING serif instead of falling back to
// the sans. A trilingual product can't use a Latin-only display face.
export const notoSerif = Noto_Serif({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-noto-serif",
  display: "swap",
});

export const notoSerifDevanagari = Noto_Serif_Devanagari({
  subsets: ["devanagari"],
  weight: ["600", "700"],
  variable: "--font-noto-serif-devanagari",
  display: "swap",
});

// Utility face: engraved flat-number plates (B-203), society codes, timestamps.
// Mono gives the tabular, "stamped" voice those artifacts need.
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

// Latin display/UI face for the public site. Manrope is a modern geometric sans
// with tight, confident tracking at large sizes — the register the brief asked
// for (Apple/Linear/Stripe), which Noto Sans is too neutral to hit.
//
// It has NO Devanagari coverage, so it is never used alone: every font stack
// that includes it falls back to Noto Sans Devanagari, which means an English
// headline renders in Manrope while the same headline in हिन्दी/मराठी renders
// in a correct Devanagari face. That is the only way to use a modern Latin
// display font in a trilingual product without breaking conjuncts.
export const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

// UI face for the signed-in app (sidebar, dashboard, forms). Inter is built for
// dense, small UI text — compact and very readable at 13–14px. Like Manrope it
// has no Devanagari, so the app stack falls back to Noto Sans Devanagari.
//
// Self-hosted (Latin subset, variable weight 400–700, from Google Fonts, OFL)
// rather than next/font/google: Next 15.2's Turbopack dev server fails on
// Google's current Inter CSS ("next/font/google queries have exactly one
// entry"), which 500s every page under `pnpm dev`.
export const inter = localFont({
  src: "../app/fonts/inter-latin-var.woff2",
  weight: "400 700",
  variable: "--font-inter",
  display: "swap",
});
