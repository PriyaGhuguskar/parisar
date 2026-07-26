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
//   3. This function (service-role) for EACH key:
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
// also rejects anonymous calls — this is NOT a trigger (no x-push-trigger sentinel).
//
// Failure mode: this function returns 200 on every HANDLED outcome (the client
// branches on `ok`); it never throws a 500. Only auth/validation failures return
// 401/400.
//
// JavaScript only — no TS annotations, no type imports, no generics.
import { createClient } from "npm:@supabase/supabase-js@2.103.3";
import { getModerator } from "./providers/index.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Single bucket; quarantine/ and posts/ are prefixes within it. storage.move()
// works cross-prefix in one bucket with the service-role key (06-RESEARCH A2).
const BUCKET = "parisar-attachments";
const MAX_PHOTOS = 4;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (req) => {
  // 1. Auth: this is an authenticated client call (NOT a trigger). Require a
  //    Bearer JWT; the user-scoped client then confirms the caller below (T-06-13).
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // 2. Parse + validate the request body.
  let body;
  try {
    body = await req.json();
  } catch (_err) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { societyId, postId, photoKeys } = body ?? {};
  if (
    !societyId ||
    !postId ||
    !Array.isArray(photoKeys) ||
    photoKeys.length === 0 ||
    photoKeys.length > MAX_PHOTOS
  ) {
    return jsonResponse({ error: "bad request" }, 400);
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

  // 4. Service-role client for Storage (download / move / remove). Bypasses RLS —
  //    intentional and the ONLY path that moves bytes into the public posts/ prefix.
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const moderate = getModerator();
  const quarantinePrefix = `${societyId}/quarantine/${postId}/`;

  const moved = [];
  const rejected = [];

  for (const key of photoKeys) {
    // 4a. Gate: the key MUST live under this caller's {society}/quarantine/{postId}/
    //     prefix. A forged key (e.g. pointing straight at posts/, or another
    //     society/post) is rejected outright — the move-to-posts gate cannot be
    //     skipped (T-06-08, Pitfall 2).
    if (typeof key !== "string" || !key.startsWith(quarantinePrefix)) {
      // Clean up anything already moved so a forged key never leaves a half-published
      // post (all-or-nothing, D-02).
      if (moved.length > 0) {
        await svc.storage.from(BUCKET).remove(moved);
      }
      return jsonResponse({ error: "bad key" }, 400);
    }

    // 4b. Download the quarantined bytes.
    const { data: file, error: dErr } = await svc.storage
      .from(BUCKET)
      .download(key);
    if (dErr || !file) {
      console.error("[moderate-image] download failed", key, dErr);
      // Treat a missing/undownloadable quarantine object as a rejection — never
      // publish bytes we couldn't inspect (fail-closed).
      rejected.push(key);
      continue;
    }

    // 4c. Moderate. FAIL-CLOSED: wrap the provider call so an unexpected error
    //     (throw / timeout) NEVER publishes an unverified image (T-06-09, D-02).
    let verdict;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const filename = key.split("/").pop();
      const result = await moderate(bytes, filename);
      verdict = result?.verdict;
    } catch (err) {
      console.error("[moderate-image] provider error — failing closed", key, err);
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
      const { error: mErr } = await svc.storage.from(BUCKET).move(key, dest);
      if (mErr) {
        console.error("[moderate-image] move failed", key, dest, mErr);
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
});
