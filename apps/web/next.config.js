/** @type {import('next').NextConfig} */

// PAR-096 — HTTP security headers (were entirely absent). Applied to every route.
// frame-ancestors 'none' + X-Frame-Options DENY stop clickjacking of the
// destructive fine/take-down/waive actions; Referrer-Policy stops the verify
// screen's phone (PII) leaking via `Referer`; nosniff + HSTS + Permissions-Policy
// are standard hardening.
//
// PAR-097 — a real Content-Security-Policy. Everything defaults to 'self'; the
// only third-party origin is the Supabase project (REST/Auth/Storage over https,
// Realtime over wss), taken from NEXT_PUBLIC_SUPABASE_URL so dev / staging / prod
// each allow exactly their own backend.
//   · script-src keeps 'unsafe-inline': Next's App Router streams inline
//     bootstrap/flight scripts, and a per-request nonce would force every page
//     dynamic via middleware (tracked as a follow-up). 'unsafe-eval' is added in
//     DEVELOPMENT ONLY — React Refresh / Turbopack HMR need it; production
//     never gets it.
//   · style-src 'unsafe-inline': components use inline style={{…}} and Next
//     injects font/style tags.
//   · img-src: data:/blob: for local photo previews before upload, plus the
//     Supabase storage origin for signed attachment URLs.
//   · connect-src in dev also allows ws: for the HMR socket.

/** Origin (scheme://host[:port]) of a URL, or null when unset / invalid. */
function originOf(url) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The matching websocket origin (https→wss, http→ws) for Supabase Realtime. */
function websocketOriginOf(origin) {
  if (!origin) return null;
  return origin.replace(/^http/, "ws");
}

function buildContentSecurityPolicy() {
  const isDev = process.env.NODE_ENV !== "production";
  const supabase = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseWs = websocketOriginOf(supabase);

  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supabase],
    "media-src": ["'self'", "blob:", supabase],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabase, supabaseWs, ...(isDev ? ["ws:", "wss:"] : [])],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };

  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.filter(Boolean).join(" ")}`)
    .join("; ");
}

// HSTS only for production: sent from `next dev` on http://localhost it would pin
// localhost to https in the browser for two years. The web app never uses the
// camera, microphone, location, payments or USB (photo upload is a plain
// <input type="file">, which Permissions-Policy does not gate), so all are off.
// COOP same-origin isolates the window from cross-origin popups/openers; CORP
// same-site stops other sites embedding our responses (images, JSON, PDFs).
function buildSecurityHeaders() {
  const isProd = process.env.NODE_ENV === "production";
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ...(isProd
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ]
      : []),
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-site" },
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
  ];
}

const config = {
  reactStrictMode: true,
  // Do not advertise the framework (X-Powered-By: Next.js).
  poweredByHeader: false,
  // Never publish source maps for the browser bundles (they expose the source).
  productionBrowserSourceMaps: false,
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
    return [{ source: "/:path*", headers: buildSecurityHeaders() }];
  },
};

module.exports = config;
