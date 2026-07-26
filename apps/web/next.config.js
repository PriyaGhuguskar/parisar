/** @type {import('next').NextConfig} */

// PAR-096 — HTTP security headers (were entirely absent). Applied to every route.
// frame-ancestors 'none' + X-Frame-Options DENY stop clickjacking of the
// destructive fine/take-down/waive actions; Referrer-Policy stops the verify
// screen's phone (PII) leaking via `Referer`; nosniff + HSTS + Permissions-Policy
// are standard hardening. A restrictive script-src CSP is intentionally NOT set
// here to avoid breaking Next's inline runtime — that (PAR-097) needs a nonce
// strategy and is tracked separately.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
];

const config = {
  reactStrictMode: true,
  // A production `next build` writes to the SAME .next directory the dev server
  // is serving from, which leaves the running dev server throwing 500s on every
  // request until it is restarted. Setting NEXT_DIST_DIR sends a build to its
  // own folder so verification builds can run while `next dev` stays up:
  //   NEXT_DIST_DIR=.next-build pnpm --filter web build
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Required for monorepo: Next must transpile workspace packages
  transpilePackages: [
    "@parisar/api-client",
    "@parisar/i18n",
    "@parisar/shared-types",
    "@parisar/ui-tokens",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = config;
