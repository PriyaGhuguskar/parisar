// Shared complaint + push-token helpers used by BOTH the web and mobile Phase 4 flows.
// Single source of truth: all Supabase calls for complaints live in this module so
// neither client duplicates RPC signatures or Realtime channel shapes.
//
// All RPC param names match the migration in
// supabase/migrations/20260526000007_phase4_complaints.sql.
//
// Functions exported:
//   1. listComplaints(supabase, opts)
//   2. getComplaintDetail(supabase, complaintId)
//   3. fileComplaint(supabase, opts)
//   4. claimComplaint(supabase, opts)
//   5. addComplaintResponse(supabase, opts)
//   6. subscribeToComplaints(supabase, societyId, handlers)
//   7. subscribeToComplaintResponses(supabase, complaintId, onInsert)
//   8. pickAndUploadComplaintPhoto(supabase, societyId, complaintId)   ← mobile only
//   9. uploadComplaintPhotoWeb(supabase, societyId, complaintId, file) ← web only
//  10. registerPushToken(supabase, opts)

import { COMPLAINT_KIND, COMPLAINT_STATUS, RESPONSE_LABELS } from "@parisar/shared-types";

// Re-export enum constants alongside the API so callers can do:
//   import { fileComplaint, COMPLAINT_STATUS } from '@parisar/api-client';
export { COMPLAINT_KIND, COMPLAINT_STATUS, RESPONSE_LABELS };

// Storage bucket name for all complaint photos. Matches the bucket created in Phase 1.
export const COMPLAINTS_BUCKET = "parisar-attachments";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * List complaints for the current society (RLS scopes server-side).
 *
 * Returns the complaint row plus joined reporter + flat + wing display fields.
 * Ordered by created_at desc.
 *
 * @param {object} supabase            - Authenticated supabase-js client
 * @param {{ limit?: number, cursor?: string|null }} [opts]
 *   - limit:  page size, default 30
 *   - cursor: ISO timestamp; when provided, returns rows created_at < cursor
 * @returns {Promise<Array>} complaint rows with embedded reporter/flat/wing
 */
export async function listComplaints(supabase, { limit = 30, cursor = null } = {}) {
  let q = supabase
    .from("complaints")
    .select(
      `
        id,
        society_id,
        reporter_id,
        reporter_flat_id,
        kind,
        description,
        status,
        owner_id,
        claimed_at,
        resolved_at,
        language_code,
        created_at,
        reporter:reporter_id ( user_id, full_name ),
        reporter_flat:reporter_flat_id ( number, wing:wing_id ( name ) ),
        owner:owner_id ( user_id, full_name )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    q = q.lt("created_at", cursor);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch a single complaint detail with full attributed response trail and attachments.
 *
 * Two reads + one attachment read (Supabase doesn't support multi-table embed for
 * polymorphic attachments via PostgREST).
 *
 * @param {object} supabase
 * @param {string} complaintId
 * @returns {Promise<{ complaint: object, responses: Array, attachments: Array }>}
 */
export async function getComplaintDetail(supabase, complaintId) {
  const { data: complaint, error: cErr } = await supabase
    .from("complaints")
    .select(
      `
        *,
        reporter:reporter_id ( user_id, full_name ),
        reporter_flat:reporter_flat_id ( number, wing:wing_id ( name ) ),
        owner:owner_id ( user_id, full_name )
      `,
    )
    .eq("id", complaintId)
    .single();
  if (cErr) throw cErr;

  const { data: responses, error: rErr } = await supabase
    .from("complaint_responses")
    .select(
      `
        id,
        response_kind,
        free_text,
        responder_id,
        responder_flat_id,
        created_at,
        responder:responder_id ( user_id, full_name ),
        responder_flat:responder_flat_id ( number, wing:wing_id ( name ) )
      `,
    )
    .eq("complaint_id", complaintId)
    .order("created_at", { ascending: true });
  if (rErr) throw rErr;

  const { data: attachments, error: aErr } = await supabase
    .from("attachments")
    .select("id, storage_key, mime_type, byte_size, created_by, created_at")
    .eq("owner_kind", "complaint")
    .eq("owner_id", complaintId);
  if (aErr) throw aErr;

  return {
    complaint,
    responses: responses ?? [],
    attachments: attachments ?? [],
  };
}

// ---------------------------------------------------------------------------
// Writes (SECURITY DEFINER RPCs — RLS is bypassed inside; we trust the migration)
// ---------------------------------------------------------------------------

/**
 * File a new complaint.
 *
 * Generates a client-side UUID for p_complaint_id so the caller can upload an
 * attachment to the canonical storage key BEFORE the complaint row exists
 * (Pitfall 7 from Phase 4 research: the photo → complaint chicken-and-egg).
 *
 * Calls: file_complaint(p_kind, p_description, p_reporter_flat_id, p_language_code,
 *                       p_complaint_id, p_storage_key, p_mime_type, p_byte_size)
 *
 * @param {object} supabase
 * @param {{
 *   kind: 'society'|'member',
 *   description: string,
 *   reporterFlatId: string,
 *   languageCode?: string,
 *   complaintId?: string,     // optional pre-generated UUID
 *   storageKey?: string|null,
 *   mimeType?: string|null,
 *   byteSize?: number|null,
 * }} opts
 * @returns {Promise<{ complaintId: string, societyId: string }>}
 */
export async function fileComplaint(
  supabase,
  {
    kind,
    description,
    reporterFlatId,
    languageCode = "en",
    complaintId,
    storageKey = null,
    mimeType = null,
    byteSize = null,
  },
) {
  // Generate a stable UUID up-front so callers that uploaded a photo can pass
  // the same id they used in the storage prefix.
  const pComplaintId = complaintId ?? cryptoRandomUUID();

  const { data, error } = await supabase.rpc("file_complaint", {
    p_kind: kind,
    p_description: description,
    p_reporter_flat_id: reporterFlatId,
    p_language_code: languageCode,
    p_complaint_id: pComplaintId,
    p_storage_key: storageKey,
    p_mime_type: mimeType,
    p_byte_size: byteSize,
  });
  if (error) throw error;

  return {
    complaintId: data.complaint_id,
    societyId: data.society_id,
  };
}

/**
 * Attempt to claim a complaint as the first responder.
 *
 * The RPC performs an atomic UPDATE on owner_id IS NULL — only one caller wins.
 * Losers receive `null` from the RPC; the caller's UI should refetch.
 *
 * Calls: claim_complaint(p_complaint_id, p_response_kind, p_free_text)
 *
 * @param {object} supabase
 * @param {{ complaintId: string, responseKind: string, freeText?: string|null }} opts
 * @returns {Promise<{ claimed: true, complaint: object } | { claimed: false }>}
 */
export async function claimComplaint(supabase, { complaintId, responseKind, freeText = null }) {
  const { data, error } = await supabase.rpc("claim_complaint", {
    p_complaint_id: complaintId,
    p_response_kind: responseKind,
    p_free_text: freeText,
  });
  if (error) throw error;

  if (data === null || data === undefined) {
    return { claimed: false };
  }
  return { claimed: true, complaint: data };
}

/**
 * Add a subsequent response to a complaint already owned by the caller.
 *
 * Calls: add_complaint_response(p_complaint_id, p_response_kind, p_free_text)
 *
 * @param {object} supabase
 * @param {{ complaintId: string, responseKind: string, freeText?: string|null }} opts
 * @returns {Promise<string>} new response UUID
 */
export async function addComplaintResponse(
  supabase,
  { complaintId, responseKind, freeText = null },
) {
  const { data, error } = await supabase.rpc("add_complaint_response", {
    p_complaint_id: complaintId,
    p_response_kind: responseKind,
    p_free_text: freeText,
  });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Realtime subscriptions
// ---------------------------------------------------------------------------

/**
 * Subscribe to new + updated complaints for a society.
 *
 * Prerequisites:
 *   1. supabase_realtime publication includes `complaints` (set in Phase 4 migration).
 *   2. The supabase client's session JWT must be bound to BOTH REST and Realtime
 *      (Phase 4 test helpers call `realtime.setAuth(accessToken)` — see
 *      tests/isolation/helpers/phase4.js for the canonical pattern).
 *   3. Subscribe AFTER a live session is confirmed; tear down on screen blur.
 *
 * RLS is enforced server-side per event — cross-society rows never reach the client.
 *
 * @param {object} supabase
 * @param {string} societyId
 * @param {{ onInsert?: Function, onUpdate?: Function, onConnected?: Function }} handlers
 * @returns {Function} cleanup — call on unmount/blur
 */
export function subscribeToComplaints(supabase, societyId, handlers) {
  const channel = supabase
    .channel(`complaints-${societyId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "complaints",
        filter: `society_id=eq.${societyId}`,
      },
      (payload) => handlers.onInsert?.(payload.new),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "complaints",
        filter: `society_id=eq.${societyId}`,
      },
      (payload) => handlers.onUpdate?.(payload.new),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        handlers.onConnected?.();
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to new responses on a single complaint (for the detail screen).
 *
 * @param {object} supabase
 * @param {string} complaintId
 * @param {Function} onInsert - called with the new row
 * @returns {Function} cleanup
 */
export function subscribeToComplaintResponses(supabase, complaintId, onInsert) {
  const channel = supabase
    .channel(`complaint-responses-${complaintId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "complaint_responses",
        filter: `complaint_id=eq.${complaintId}`,
      },
      (payload) => onInsert?.(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Storage uploads
// ---------------------------------------------------------------------------

/**
 * MOBILE ONLY — pick, compress, and upload a complaint photo from the device gallery.
 *
 * This function dynamically imports expo-image-picker, expo-image-manipulator, and
 * expo-file-system so that bundling on the web side does not pull native modules.
 * Web callers must use {@link uploadComplaintPhotoWeb} instead.
 *
 * The base64 → atob → Uint8Array chain is mandatory: the Supabase JS client cannot
 * consume a `file://` URI directly (a documented Supabase + Expo gotcha; uploads
 * silently send 0-byte files when you try).
 *
 * Storage key format (RLS-enforced prefix):
 *   {societyId}/complaints/{complaintId}/{photoUuid}.jpg
 *
 * @param {object} supabase
 * @param {string} societyId   - current society UUID (must match RLS prefix)
 * @param {string} complaintId - target complaint UUID (may be pre-generated by caller)
 * @returns {Promise<{ storageKey: string, mimeType: string, byteSize: number } | null>}
 *   null if the user cancelled or denied media-library permission.
 */
export async function pickAndUploadComplaintPhoto(supabase, societyId, complaintId) {
  // Dynamic imports keep these native modules out of the web bundle.
  // The `webpackIgnore: true` magic comment tells Next.js's webpack to skip
  // resolution at build time — these only run on RN, where Metro handles them.
  const ImagePicker = await import(/* webpackIgnore: true */ "expo-image-picker");
  const ImageManipulator = await import(/* webpackIgnore: true */ "expo-image-manipulator");
  const FileSystem = await import(/* webpackIgnore: true */ "expo-file-system");

  // 1. Permission gate.
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  // 2. Pick from gallery at full quality (compress next).
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 1,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];

  // 3. Resize to ≤1600px longest side, JPEG quality 0.7 (Indian-network friendly).
  const resize = asset.width > asset.height ? { width: 1600 } : { height: 1600 };
  const manipResult = await ImageManipulator.manipulateAsync(asset.uri, [{ resize }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  // 4. Read the resized file as base64 — only way to get ArrayBuffer from file://.
  const base64 = await FileSystem.readAsStringAsync(manipResult.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // 5. base64 → binary string → Uint8Array.
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // 6. Upload under the RLS-enforced society prefix.
  const photoId = cryptoRandomUUID();
  const storageKey = `${societyId}/complaints/${complaintId}/${photoId}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(COMPLAINTS_BUCKET)
    .upload(storageKey, bytes.buffer, {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  return {
    storageKey,
    mimeType: "image/jpeg",
    byteSize: bytes.length,
  };
}

/**
 * WEB ONLY — upload a File/Blob from a `<input type="file">` to the complaints
 * storage bucket. No file:// conversion needed in browsers.
 *
 * @param {object} supabase
 * @param {string} societyId
 * @param {string} complaintId
 * @param {File|Blob} file
 * @returns {Promise<{ storageKey: string, mimeType: string, byteSize: number }>}
 */
export async function uploadComplaintPhotoWeb(supabase, societyId, complaintId, file) {
  const photoId = cryptoRandomUUID();
  // Preserve the original extension where possible; default to jpg.
  const ext = guessExtensionFromMime(file.type) ?? "jpg";
  const storageKey = `${societyId}/complaints/${complaintId}/${photoId}.${ext}`;

  const { error } = await supabase.storage.from(COMPLAINTS_BUCKET).upload(storageKey, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;

  return {
    storageKey,
    mimeType: file.type || "image/jpeg",
    byteSize: file.size ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Push token registration
// ---------------------------------------------------------------------------

/**
 * Upsert a push token row for the current user.
 *
 * - user_id is fetched server-side via supabase.auth.getUser() — NEVER trust a
 *   client-supplied user_id (threat T-04-14).
 * - On conflict on expo_token (unique), updates last_seen_at + notifications_enabled.
 *
 * @param {object} supabase
 * @param {{ expoToken: string, platform: 'ios'|'android'|'web', deviceLabel?: string|null }} opts
 * @returns {Promise<string|null>} the expoToken on success, null if no auth user.
 */
export async function registerPushToken(supabase, { expoToken, platform, deviceLabel = null }) {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const userId = userRes?.user?.id;
  if (!userId) return null;

  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      expo_token: expoToken,
      platform,
      device_label: deviceLabel,
      last_seen_at: new Date().toISOString(),
      notifications_enabled: true,
    },
    { onConflict: "expo_token" },
  );
  if (error) throw error;
  return expoToken;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Cross-runtime UUID generator. `crypto.randomUUID` exists in:
 *   - Node 19+ (globalThis.crypto)
 *   - All modern browsers (web crypto)
 *   - React Native via `expo-crypto` polyfill (loaded by Expo Router setup)
 *
 * Falls back to a v4-shaped string built from getRandomValues if randomUUID
 * is unavailable (older RN runtimes).
 */
function cryptoRandomUUID() {
  const g = globalThis.crypto;
  if (g && typeof g.randomUUID === "function") {
    return g.randomUUID();
  }
  // Fallback: build RFC4122 v4 UUID from random bytes.
  const bytes = new Uint8Array(16);
  if (g && typeof g.getRandomValues === "function") {
    g.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function guessExtensionFromMime(mime) {
  if (!mime) return null;
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  return null;
}
