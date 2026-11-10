import { IBM_Plex_Mono, Manrope, Noto_Sans_Devanagari } from "next/font/google";
import localFont from "next/font/local";

// Inter is the single UI family; Noto Sans Devanagari carries hi and mr (Inter has no
// Devanagari). Manrope and Plex Mono below remain only for the landing page until its
// owner moves it onto the new tokens. Self-hosted via next/font: no Google CDN.
export const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "600"],
  variable: "--font-noto-devanagari",
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

// The UI face for every screen except the landing page. Inter is built for dense,
// small UI text: compact and very readable at 13–14px. It has no Devanagari, so the
// stack in app/tokens.css falls back to Noto Sans Devanagari.
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
