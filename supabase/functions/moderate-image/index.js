// moderate-image Edge Function — synchronous, client-awaited image-safety gate.
//
// This is the GENUINELY NEW server shape in Phase 6 (COMM-03, D-01/D-02). Unlike
// the fire-and-forget push triggers (notification-fanout / booking-ack-fanout),
// image moderation is CLIENT-AWAITED: the image bytes live in Storage (not
// Postgres), so a pg trigger cannot inspect them. This function orchestrates:
//
//   1. The composer client generates postId up-front and uploads each photo to a
//      PRIVATE quarantine prefix: {societyId}/quarantine/{postId}/{photoId}.jpg
//      (society-prefix Storage RLS allows the quarantine write).
//   2. The client calls THIS function (authenticated, user JWT in Authorization)
//      with { societyId, postId, photoKeys: [...] }.
//   3. Before touching Storage (migration 055 / review H9): societyId + postId
//      must be UUIDs, every key must be exactly
//      {societyId}/quarantine/{postId}/{[\w.-]+} (no "..", no "//"), the caller
//      must be an ACTIVE member of societyId (live check), and the caller must be
//      under 20 calls / 10 min (public.svc_rate_limit_hit). Files > 5 MiB reject.
//      Then this function (service-role) for EACH key:
//        - VERIFIES the key is under {societyId}/quarantine/{postId}/ (the gate
//          cannot be skipped with a forged key — T-06-08).
//        - downloads the bytes -> moderate(bytes, filename) via the swappable
//          adapter (MODERATION_PROVIDER: stub | vision | rekognition).
//        - PASS  -> storage.move() within the SAME bucket from quarantine/ to
//                   {societyId}/posts/{postId}/ (only the service role can place
//                   bytes in posts/, so an attacker cannot pre-stage them there).
//        - REJECT-> storage.remove() the quarantine bytes.
//   4. If ANY key is rejected -> remove any already-moved bytes too (all-or-nothing,
//      D-02) and return { ok:false, rejected }. The post is NEVER created.
//   5. All pass -> return { ok:true, movedKeys }. The client then calls create_post
//      with the moved keys; create_post's OQ2 key-guard (Plan 01) accepts ONLY
//      keys under {society}/posts/{postId}/ — closing the bypass. The post (and its
//      photos) become visible ONLY now (D-02 sync-block).
//
// FAIL-CLOSED (T-06-09, D-02): if the moderation provider throws / times out, the
// image is treated as a REJECT — we NEVER publish an unverified image. The function
// returns { ok:false, error:"check_failed" } and the UI surfaces
// community.imgCheckError.
//
// Auth surface (T-06-13): requires `Authorization: Bearer <user JWT>`; a user-scoped
// client verifies auth.getUser(). config.toml sets verify_jwt = true so the gateway
// also rejects anonymous calls — this is NOT a trigger (no webhook secret).
//
// Failure mode: this function returns 200 on every HANDLED outcome (the client
// branches on `ok`). Auth/validation failures return 401/400/403/405/413; an
// unexpected exception returns a generic 500 { ok:false, error:"check_failed" }
// (no stack or provider detail in the response).
//
// Browser calls (website post composer): CORS answers only origins listed in env
// ALLOWED_ORIGINS (exact match, see ../_shared/http.js); a request carrying any
// other Origin is refused before it touches Storage. The native app sends no
// Origin header and is unaffected.
//
// Content check: a quarantined object is published only if its first bytes are
// a JPEG / PNG / GIF / WebP / HEIC-HEIF-AVIF signature, whatever Content-Type
// the uploader claimed.
//
// JavaScript only — no TS annotations, no type imports, no generics.
import { createClient } from "npm:@supabase/supabase-js@2.103.3";
import {
  corsHeadersFor,
  isLocalSupabaseUrl,
  json,
  parseAllowedOrigins,
  readJsonObject,
} from "../_shared/http.js";
import { getModerator } from "./providers/index.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS"), {
  isLocal: isLocalSupabaseUrl(SUPABASE_URL),
});
// { societyId, postId, photoKeys[<=4] } is a few hundred bytes.
const MAX_BODY_BYTES = 8 * 1024;

// Single bucket; quarantine/ and posts/ are prefixes within it. storage.move()
// works cross-prefix in one bucket with the service-role key (06-RESEARCH A2).
const BUCKET = "parisar-attachments";
const MAX_PHOTOS = 4;
// Per-file cap. Clients compress to <=1600px JPEG 0.7 (typically <300KB), so
// anything over this is not a phone photo from our composer.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
// Per-user rate limit (public.svc_rate_limit_hit, migration 055 §3).
const RATE_BUCKET = "moderate-image";
const RATE_MAX_CALLS = 20;
const RATE_WINDOW_SECONDS = 600;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILENAME_RE = /^[\w.-]+$/;

const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "mif1",
  "msf1",
  "avif",
  "avis",
]);

/**
 * True when the bytes start with a raster-image signature we publish.
 * @param {Uint8Array} b
 */
function looksLikeImage(b) {
  if (!b || b.length < 12) return false;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // PNG
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true; // GIF8
  const ascii = (from, to) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return true; // WebP
  if (ascii(4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(8, 12))) return true; // HEIC/HEIF/AVIF
  return false;
}

/**
 * A key is acceptable only as exactly {societyId}/quarantine/{postId}/{file}
 * where file is [\w.-]+ and never "." / ".." (no traversal, no nesting).
 */
function isValidQuarantineKey(key, societyId, postId) {
  if (typeof key !== "string" || key.length > 512) return false;
  if (key.includes("..") || key.includes("//") || key.includes("\\")) return false;
  const parts = key.split("/");
  if (parts.length !== 4) return false;
  const [soc, prefix, post, file] = parts;
  return (
    soc === societyId &&
    prefix === "quarantine" &&
    post === postId &&
    FILENAME_RE.test(file) &&
    file !== "." &&
    file !== ".."
  );
}

/** Pull just the basename for logs — never log full keys with ids. */
function keyLabel(key) {
  return typeof key === "string" ? key.split("/").pop() : "?";
}

Deno.serve(async (req) => {
  // 0. CORS + method gate. A browser Origin that is not allow-listed is refused
  //    outright (no CORS headers, no work done).
  const cors = corsHeadersFor(req, ALLOWED_ORIGINS);
  if (req.headers.get("origin") && !cors) {
    return json({ error: "Forbidden" }, 403);
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors ?? {} });
  }
  /** @param {unknown} b @param {number} [s] */
  const respond = (b, s = 200) => json(b, s, cors);
  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    console.error("[moderate-image] Supabase env not configured — refusing");
    return respond({ ok: false, error: "check_failed" }, 500);
  }

  try {
    return await handleModeration(req, respond);
  } catch (err) {
    console.error("[moderate-image] unexpected failure", err?.message ?? "unknown");
    return respond({ ok: false, error: "check_failed" }, 500);
  }
});

/**
 * @param {Request} req
 * @param {(body: unknown, status?: number) => Response} jsonResponse
 */
async function handleModeration(req, jsonResponse) {
  // 1. Auth: this is an authenticated client call (NOT a trigger). Require a
  //    Bearer JWT; the user-scoped client then confirms the caller below (T-06-13).
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // 2. Parse + validate the request body (size-capped).
  const parsed = await readJsonObject(req, MAX_BODY_BYTES);
  if ("error" in parsed) {
    return parsed.error === "TOO_LARGE"
      ? jsonResponse({ error: "Payload too large" }, 413)
      : jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { societyId, postId, photoKeys } = parsed.body;
  if (
    !UUID_RE.test(String(societyId ?? "")) ||
    !UUID_RE.test(String(postId ?? "")) ||
    !Array.isArray(photoKeys) ||
    photoKeys.length === 0 ||
    photoKeys.length > MAX_PHOTOS
  ) {
    return jsonResponse({ error: "bad request" }, 400);
  }
  // 2a. Every key must be a plain {society}/quarantine/{post}/{file} path. A
  //     forged key (posts/, another society/post, traversal) is rejected before
  //     any storage call (T-06-08, Pitfall 2).
  if (!photoKeys.every((k) => isValidQuarantineKey(k, societyId, postId))) {
    return jsonResponse({ error: "bad key" }, 400);
  }
  if (new Set(photoKeys).size !== photoKeys.length) {
    return jsonResponse({ error: "bad key" }, 400);
  }

  // 3. User-scoped client (anon key + the caller's JWT) → verify the caller is a
  //    real authenticated user. The gateway (verify_jwt=true) already checks the
  //    signature; getUser() is the in-function confirmation (defence in depth).
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const userId = u.user.id;

  // 4. Service-role client for the membership check, the rate limit and Storage
  //    (download / move / remove). Bypasses RLS — intentional and the ONLY path
  //    that moves bytes into the posts/ prefix.
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 4a. The caller must be an ACTIVE member of societyId — checked live against
  //     society_memberships, not the (up to 1h old) JWT claim.
  const { data: membership, error: mErr } = await svc
    .from("society_memberships")
    .select("id")
    .eq("society_id", societyId)
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (mErr) {
    console.error("[moderate-image] membership check failed", mErr.message);
    return jsonResponse({ ok: false, error: "check_failed" });
  }
  if (!membership) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  // 4b. Per-user rate limit (fail closed on error).
  const { data: allowed, error: rlErr } = await svc.rpc("svc_rate_limit_hit", {
    p_bucket: RATE_BUCKET,
    p_subject: userId,
    p_max: RATE_MAX_CALLS,
    p_window_seconds: RATE_WINDOW_SECONDS,
  });
  if (rlErr) {
    console.error("[moderate-image] rate limit check failed", rlErr.message);
    return jsonResponse({ ok: false, error: "check_failed" });
  }
  if (allowed !== true) {
    return jsonResponse({ error: "rate_limited" }, 429);
  }

  const moderate = getModerator();

  const moved = [];
  const rejected = [];

  for (const key of photoKeys) {
    // 4b. Download the quarantined bytes.
    const { data: file, error: dErr } = await svc.storage.from(BUCKET).download(key);
    if (dErr || !file) {
      console.error("[moderate-image] download failed", keyLabel(key), dErr?.message);
      // Treat a missing/undownloadable quarantine object as a rejection — never
      // publish bytes we couldn't inspect (fail-closed).
      rejected.push(key);
      continue;
    }

    // 4b'. Size cap — oversized bytes are rejected and removed, never moderated.
    if (typeof file.size === "number" && file.size > MAX_FILE_BYTES) {
      await svc.storage.from(BUCKET).remove([key]);
      rejected.push(key);
      continue;
    }

    // 4c. Moderate. FAIL-CLOSED: wrap the provider call so an unexpected error
    //     (throw / timeout) NEVER publishes an unverified image (T-06-09, D-02).
    let verdict;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // 4b''. Not a raster image (HTML, SVG, script, …) → reject and remove,
      //       never moderated, never published.
      if (!looksLikeImage(bytes)) {
        await svc.storage.from(BUCKET).remove([key]);
        rejected.push(key);
        continue;
      }
      const filename = key.split("/").pop();
      const result = await moderate(bytes, filename);
      verdict = result?.verdict;
    } catch (err) {
      console.error(
        "[moderate-image] provider error — failing closed",
        keyLabel(key),
        err?.message,
      );
      // Remove the quarantined bytes and any already-moved bytes, then surface a
      // generic check_failed to the client (no provider internals leaked).
      await svc.storage.from(BUCKET).remove([key]);
      if (moved.length > 0) {
        await svc.storage.from(BUCKET).remove(moved);
      }
      return jsonResponse({ ok: false, error: "check_failed" });
    }

    if (verdict === "pass") {
      // 4d. PASS → move quarantine/ bytes to posts/ (same bucket, cross-prefix).
      const dest = key.replace(
        `${societyId}/quarantine/${postId}/`,
        `${societyId}/posts/${postId}/`,
      );
      const { error: moveErr } = await svc.storage.from(BUCKET).move(key, dest);
      if (moveErr) {
        console.error("[moderate-image] move failed", keyLabel(key), moveErr?.message);
        // A move failure is treated as a rejection (fail-closed) — clean the source.
        await svc.storage.from(BUCKET).remove([key]);
        rejected.push(key);
      } else {
        moved.push(dest);
      }
    } else {
      // 4e. REJECT → remove the quarantined bytes.
      await svc.storage.from(BUCKET).remove([key]);
      rejected.push(key);
    }
  }

  // 5. All-or-nothing (D-02): if ANY key was rejected, remove any bytes that DID
  //    move so a partial pass never leaves a publishable photo set behind. The
  //    client shows the reject state; the post is never created.
  if (rejected.length > 0) {
    if (moved.length > 0) {
      await svc.storage.from(BUCKET).remove(moved);
    }
    return jsonResponse({ ok: false, rejected });
  }

  // 6. Every photo passed → the moved keys are the ONLY acceptable create_post
  //    inputs (they live under {society}/posts/{postId}/, which create_post's
  //    OQ2 guard requires).
  return jsonResponse({ ok: true, movedKeys: moved });
}
