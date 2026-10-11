// Shared HTTP hygiene for the Edge Functions: request-size limits, JSON parsing
// and an exact-match CORS allowlist.
//
// CORS policy:
//   * Only functions a BROWSER calls answer CORS (today: moderate-image, invoked
//     by the website's post composer). Server-to-server functions (fan-outs,
//     send-sms hook) and native-only ones (pin-login) send no CORS headers.
//   * Allowed origins come from env ALLOWED_ORIGINS — a comma-separated list of
//     exact origins, e.g. "https://parisar.app,https://www.parisar.app".
//     "*" and anything that is not a plain http(s) origin are ignored. No
//     credentials header is ever sent (the apps authenticate with a Bearer
//     token, not cookies).
//   * Unset in a local stack → http://localhost:3000 and http://127.0.0.1:3000.
//     Unset anywhere else → no origin is allowed (fail closed).
//
// JavaScript only — no TS annotations, no type imports, no generics.

const LOCAL_URL_RE = /^https?:\/\/(kong|localhost|127\.0\.0\.1|host\.docker\.internal)(:\d+)?/i;
const ORIGIN_RE = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;
const LOCAL_DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

/** True when SUPABASE_URL points at a local stack (`supabase start` / `functions serve`). */
export function isLocalSupabaseUrl(url) {
  return LOCAL_URL_RE.test(String(url ?? ""));
}

/**
 * Parse ALLOWED_ORIGINS into a Set of exact origins.
 * @param {string|undefined|null} raw
 * @param {{ isLocal?: boolean }} [opts]
 * @returns {Set<string>}
 */
export function parseAllowedOrigins(raw, { isLocal = false } = {}) {
  const list = String(raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => s !== "" && s !== "*" && ORIGIN_RE.test(s));
  if (list.length === 0 && isLocal) return new Set(LOCAL_DEV_ORIGINS);
  return new Set(list);
}

/**
 * CORS headers for an allowed Origin, else null (also null when no Origin is
 * sent, e.g. the native mobile app or a server).
 * @param {Request} req
 * @param {Set<string>} allowed
 */
export function corsHeadersFor(req, allowed) {
  const origin = req.headers.get("origin");
  if (!origin || !allowed.has(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-region",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/**
 * JSON response with no-store caching and optional extra (CORS) headers.
 * @param {unknown} body
 * @param {number} [status]
 * @param {Record<string, string>|null} [extraHeaders]
 */
export function json(body, status = 200, extraHeaders = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(extraHeaders ?? {}),
    },
  });
}

/**
 * Read the request body as text, refusing anything over maxBytes (checked
 * against Content-Length first, then while streaming).
 * @param {Request} req
 * @param {number} maxBytes
 * @returns {Promise<{ text: string } | { tooLarge: true }>}
 */
export async function readBodyText(req, maxBytes) {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return { tooLarge: true };
  if (!req.body) return { text: "" };

  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch (_err) {
        // the stream is being abandoned anyway
      }
      return { tooLarge: true };
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return { text: new TextDecoder().decode(buf) };
}

/**
 * Read + parse a JSON object body with a size cap.
 * @param {Request} req
 * @param {number} maxBytes
 * @returns {Promise<{ body: Record<string, unknown> } | { error: "TOO_LARGE" | "INVALID_JSON" }>}
 */
export async function readJsonObject(req, maxBytes) {
  const read = await readBodyText(req, maxBytes);
  if ("tooLarge" in read) return { error: "TOO_LARGE" };
  let parsed;
  try {
    parsed = JSON.parse(read.text);
  } catch (_err) {
    return { error: "INVALID_JSON" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "INVALID_JSON" };
  }
  return { body: parsed };
}
