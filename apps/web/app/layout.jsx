// apps/web/app/layout.jsx
// Phase 7 — Plan 07-04 Task 1: read parisar_lang cookie server-side, seed the
// client i18next provider with the same lng + preloaded resources so SSR HTML
// and client hydration agree (RESEARCH.md Pitfall 2 → T-07-16 mitigation).
//
// The <html lang> attribute now reflects the cookie locale (was hardcoded
// "en") so screen readers + the browser locale-aware features match the
// active language.

import "./globals.css";
// Subpath import: keeps `react-i18next` out of the Server Component bundle.
import { AUTH_NAMESPACE, NAMESPACES } from "@parisar/i18n/namespaces";
import { I18nProvider } from "../components/I18nProvider";
import {
  manrope,
  notoSans,
  notoSansDevanagari,
  notoSerif,
  notoSerifDevanagari,
  plexMono,
} from "../lib/fonts";
import { initTranslations, readLocaleFromCookies } from "../lib/i18n/server";

export const metadata = {
  title: "Parisar",
  description: "Society management platform",
  icons: { icon: "/parisar-mark-192.png", apple: "/parisar-apple.png" },
  manifest: "/manifest.webmanifest",
  applicationName: "Parisar",
  // Tells iOS to launch from the home screen WITHOUT Safari chrome, and to use
  // a translucent status bar so the app's own colour runs to the top edge.
  appleWebApp: {
    capable: true,
    title: "Parisar",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

// viewportFit:"cover" is required for env(safe-area-inset-*) to report real
// values on notched phones. Without it the insets are all 0 and an installed
// app draws its header under the notch and its footer under the home
// indicator. maximumScale is deliberately NOT capped — locking zoom is an
// accessibility failure, and residents include older users who pinch to read.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF6EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1F19" },
  ],
};

export default async function RootLayout({ children }) {
  const lng = await readLocaleFromCookies();
  // BUGFIX: `NAMESPACES` lists only the 9 per-domain shards, but 24 components
  // call useTranslation("auth") — the synthetic namespace backed by the FLAT
  // top-level <lng>.json (auth + common + setup + join + directory + removal…).
  // It was never preloaded, so every one of those screens rendered raw keys
  // ("common.appName", "auth.roleSelectHeading") instead of copy. AUTH_NAMESPACE
  // is deliberately kept OUT of the NAMESPACES array because the i18n-coverage
  // gate iterates that array expecting a locales/<lng>/<ns>.json shard per entry.
  const { resources, namespaces } = await initTranslations(lng, [...NAMESPACES, AUTH_NAMESPACE]);
  return (
    <html
      lang={lng}
      className={[
        manrope.variable,
        notoSans.variable,
        notoSansDevanagari.variable,
        notoSerif.variable,
        notoSerifDevanagari.variable,
        plexMono.variable,
      ].join(" ")}
    >
      <body className="font-sans antialiased">
        <I18nProvider lng={lng} resources={resources} namespaces={namespaces}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
