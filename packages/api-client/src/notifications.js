// Shared notification (society notice) helpers used by BOTH the web and mobile
// Phase 5 flows. Single source of truth: all Supabase calls for notices live in
// this module so neither client duplicates RPC signatures or Realtime channel shapes.
//
// All RPC param names match the migration in
// supabase/migrations/20260528000008_phase5_notifications_bookings.sql.
//
// Functions exported:
//   1. listNotices(supabase, opts)
//   2. getNoticeDetail(supabase, noticeId)
//   3. fileNotification(supabase, opts)
//   4. subscribeToNotices(supabase, societyId, handlers)
//   5. markNoticeRead(supabase, noticeId)                 ← fast-follow no-op stub
//   6. ensureNotificationPreferences(supabase, societyId) ← re-exported from preferences.js (D-05)
//   7. pickAndUploadNoticeAttachment(supabase, societyId, noticeId) ← mobile only (PDF + image)
//   8. uploadNoticeAttachmentWeb(supabase, societyId, noticeId, file) ← web only

import { NOTIFICATION_CATEGORY, NOTIFICATION_KIND } from "@parisar/shared-types";
import { cryptoRandomUUID } from "./uuid.js";

// Re-export enum constants alongside the API so callers can do:
//   import { fileNotification, NOTIFICATION_CATEGORY } from '@parisar/api-client';
export { NOTIFICATION_KIND, NOTIFICATION_CATEGORY };

// D-05 helper lives in preferences.js; re-export so callers can pull it from the
// notifications module (the notices surface provisions prefs on first session).
export { ensureNotificationPreferences } from "./preferences.js";

// Storage bucket name for all attachments. Matches the bucket created in Phase 1.
export const NOTICES_BUCKET = "parisar-attachments";

// ---------------------------------------------------------------------------
// Reads (RLS scopes server-side to current_society_id())
// ---------------------------------------------------------------------------

/**
 * List society notices, newest first. RLS scopes to the caller's society.
 *
 * Returns the notice row plus the author + author_flat embed (NOTF-04) and a
 * `polls` existence flag (left-joined so the card can render the PollPill).
 *
 * @param {object} supabase
 * @param {{ limit?: number, cursor?: string|null, pollsOnly?: boolean }} [opts]
 *   - limit:     page size, default 30
 *   - cursor:    ISO timestamp; when provided, returns rows created_at < cursor
 *   - pollsOnly: when true, restrict to kind='poll' (the Polls tile filtered view, DD-1)
 * @returns {Promise<Array>} notice rows with embedded author/flat + poll marker
 */
export async function listNotices(supabase, { limit = 30, cursor = null, pollsOnly = false } = {}) {
  let q = supabase
    .from("notifications")
    .select(
      `
        id,
        society_id,
        author_id,
        author_flat_id,
        kind,
        category,
        title,
        body,
        created_at,
        author:author_id ( user_id, full_name ),
        author_flat:author_flat_id ( number, wing:wing_id ( name ) ),
        polls ( id, question, status )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (pollsOnly) {
    q = q.eq("kind", NOTIFICATION_KIND.POLL);
  }
  if (cursor) {
    q = q.lt("created_at", cursor);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch a single notice with attribution, attachments, and (if present) the poll
 * + options + the caller's own vote.
 *
 * Multiple reads (PostgREST cannot embed the polymorphic attachments table).
 *
 * @param {object} supabase
 * @param {string} noticeId
 * @returns {Promise<{ notice: object, attachments: Array, poll: object|null,
 *                      options: Array, myVote: object|null }>}
 */
export async function getNoticeDetail(supabase, noticeId) {
  const { data: notice, error: nErr } = await supabase
    .from("notifications")
    .select(
      `
        *,
        author:author_id ( user_id, full_name ),
        author_flat:author_flat_id ( number, wing:wing_id ( name ) )
      `,
    )
    .eq("id", noticeId)
    .single();
  if (nErr) throw nErr;

  const { data: attachments, error: aErr } = await supabase
    .from("attachments")
    .select("id, storage_key, mime_type, byte_size, created_by, created_at")
    .eq("owner_kind", "notification")
    .eq("owner_id", noticeId);
  if (aErr) throw aErr;

  // Optional poll (unique notification_id → at most one).
  const { data: poll, error: pErr } = await supabase
    .from("polls")
    .select("id, question, status, closed_at, created_at")
    .eq("notification_id", noticeId)
    .maybeSingle();
  if (pErr) throw pErr;

  let options = [];
  let myVote = null;
  if (poll) {
    const { data: opts, error: oErr } = await supabase
      .from("poll_options")
      .select("id, label, position")
      .eq("poll_id", poll.id)
      .order("position", { ascending: true });
    if (oErr) throw oErr;
    options = opts ?? [];

    // RLS exposes ALL same-society votes (needed for the aggregate tally), so we
    // MUST scope "my vote" to the session user — otherwise ≥2 voters yields multiple
    // rows (PGRST116 throw) or a stranger's vote leaks in, prematurely revealing
    // results and breaking the anti-bandwagon gate.
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? null;
    if (uid) {
      const { data: vote, error: vErr } = await supabase
        .from("poll_votes")
        .select("id, option_id")
        .eq("poll_id", poll.id)
        .eq("user_id", uid)
        .maybeSingle();
      if (vErr) throw vErr;
      myVote = vote ?? null;
    }
  }

  return {
    notice,
    attachments: attachments ?? [],
    poll: poll ?? null,
    options,
    myVote,
  };
}

// ---------------------------------------------------------------------------
// Writes (SECURITY DEFINER RPC — direct table writes are REVOKED, T-05-15)
// ---------------------------------------------------------------------------

/**
 * Post a new society notice with an optional attachment and optional poll.
 *
 * Pre-generates a client-side UUID for p_notification_id so the caller can upload
 * an attachment to the canonical storage key BEFORE the notice row exists (the
 * same chicken-and-egg solved for complaints in Phase 4). The `kind` is derived
 * server-side from poll presence.
 *
 * Calls: file_notification(p_title, p_body, p_category, p_notification_id,
 *                          p_storage_key, p_mime_type, p_byte_size,
 *                          p_poll_question, p_poll_options text[])
 *
 * @param {object} supabase
 * @param {{
 *   title: string,
 *   body: string,
 *   category?: string,
 *   noticeId?: string,            // optional pre-generated UUID
 *   storageKey?: string|null,
 *   mimeType?: string|null,
 *   byteSize?: number|null,
 *   pollQuestion?: string|null,
 *   pollOptions?: string[]|null,  // 2..4 labels; null = no poll
 * }} opts
 * @returns {Promise<{ notificationId: string, societyId: string, pollId: string|null }>}
 */
export async function fileNotification(
  supabase,
  {
    title,
    body,
    category = NOTIFICATION_CATEGORY.GENERAL,
    noticeId,
    storageKey = null,
    mimeType = null,
    byteSize = null,
    pollQuestion = null,
    pollOptions = null,
  },
) {
  const pNotificationId = noticeId ?? cryptoRandomUUID();

  const { data, error } = await supabase.rpc("file_notification", {
    p_title: title,
    p_body: body,
    p_category: category,
    p_notification_id: pNotificationId,
    p_storage_key: storageKey,
    p_mime_type: mimeType,
    p_byte_size: byteSize,
    p_poll_question: pollQuestion,
    p_poll_options: pollOptions,
  });
  if (error) throw error;

  return {
    notificationId: data.notification_id,
    societyId: data.society_id,
    pollId: data.poll_id ?? null,
  };
}

/**
 * Mark a notice read for the current user.
 *
 * FAST-FOLLOW STUB. The UI-SPEC (§Read/Unread Tracking) explicitly allows
 * read-tracking to ship as a fast-follow: until a per-user read marker exists in
 * the DB, the NoticeCard degrades gracefully (renders all notices as "unread" and
 * the tile shows no badge). Plan 05-01's migration intentionally does NOT add a
 * `notification_reads` table, so this is a no-op returning true rather than
 * inventing new DB surface here. Wire the real marker in a future plan.
 *
 * @param {object} _supabase
 * @param {string} _noticeId
 * @returns {Promise<boolean>} always true
 */
// eslint-disable-next-line no-unused-vars
export async function markNoticeRead(_supabase, _noticeId) {
  // fast-follow: no read-marker table in 05-01; degrade to all-unread.
  return true;
}

// ---------------------------------------------------------------------------
// Realtime subscriptions
// ---------------------------------------------------------------------------

/**
 * Subscribe to new notices for a society (NOTF-03 in-app).
 *
 * `notifications` is in the supabase_realtime publication (Plan 05-01). RLS is
 * enforced server-side per event — cross-society rows never reach the client.
 *
 * @param {object} supabase
 * @param {string} societyId
 * @param {{ onInsert?: Function, onConnected?: Function }} handlers
 * @returns {Function} cleanup — call on unmount/blur
 */
export function subscribeToNotices(supabase, societyId, handlers) {
  const channel = supabase
    .channel(`notifications-${societyId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `society_id=eq.${societyId}`,
      },
      (payload) => handlers.onInsert?.(payload.new),
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

// ---------------------------------------------------------------------------
// Storage uploads (PDF + image — extends the Phase 4 complaint-photo chain)
// ---------------------------------------------------------------------------

/**
 * MOBILE ONLY — pick + upload a notice attachment (PDF or image) from the device.
 *
 * Dynamically imports the Expo native modules so the web bundle never pulls them.
 * Web callers must use {@link uploadNoticeAttachmentWeb} instead.
 *
 * - PDFs (via expo-document-picker) upload as-is — NO resize.
 * - Images (via expo-image-picker) are resized to ≤1600px / JPEG 0.7 like Phase 4,
 *   then converted base64 → Uint8Array (the Supabase JS client cannot consume a
 *   `file://` URI directly — a documented Supabase + Expo gotcha).
 *
 * Storage key format (RLS-enforced prefix):
 *   {societyId}/notifications/{noticeId}/{attachmentUuid}.{ext}
 *
 * @param {object} supabase
 * @param {string} societyId
 * @param {string} noticeId  - target notice UUID (may be pre-generated by caller)
 * @param {{ allowPdf?: boolean }} [opts]
 * @returns {Promise<{ storageKey: string, mimeType: string, byteSize: number } | null>}
 *   null if the user cancelled or denied permission.
 */
export async function pickAndUploadNoticeAttachment(
  supabase,
  societyId,
  noticeId,
  { allowPdf = true } = {},
) {
  const ImagePicker = await import(/* webpackIgnore: true */ "expo-image-picker");
  const ImageManipulator = await import(/* webpackIgnore: true */ "expo-image-manipulator");
  const FileSystem = await import(/* webpackIgnore: true */ "expo-file-system");

  // Offer the PDF branch first (document picker), falling back to the gallery.
  if (allowPdf) {
    const DocumentPicker = await import(/* webpackIgnore: true */ "expo-document-picker");
    const doc = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false,
    });
    // A user who picked a PDF: upload it verbatim (no resize).
    if (!doc.canceled && doc.assets?.[0]) {
      const asset = doc.assets[0];
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = base64ToBytes(base64);
      const attId = cryptoRandomUUID();
      const storageKey = `${societyId}/notifications/${noticeId}/${attId}.pdf`;
      const { error: upErr } = await supabase.storage
        .from(NOTICES_BUCKET)
        .upload(storageKey, bytes.buffer, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;
      return { storageKey, mimeType: "application/pdf", byteSize: bytes.length };
    }
    // doc.canceled here means the user backed out of the PDF picker entirely.
    return null;
  }

  // Image branch (mirrors pickAndUploadComplaintPhoto).
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 1,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];

  const resize = asset.width > asset.height ? { width: 1600 } : { height: 1600 };
  const manipResult = await ImageManipulator.manipulateAsync(asset.uri, [{ resize }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const base64 = await FileSystem.readAsStringAsync(manipResult.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);

  const attId = cryptoRandomUUID();
  const storageKey = `${societyId}/notifications/${noticeId}/${attId}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(NOTICES_BUCKET)
    .upload(storageKey, bytes.buffer, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  return { storageKey, mimeType: "image/jpeg", byteSize: bytes.length };
}

/**
 * WEB ONLY — upload a PDF or image File/Blob from a `<input type="file">`.
 * No file:// conversion needed in browsers.
 *
 * @param {object} supabase
 * @param {string} societyId
 * @param {string} noticeId
 * @param {File|Blob} file
 * @returns {Promise<{ storageKey: string, mimeType: string, byteSize: number }>}
 */
export async function uploadNoticeAttachmentWeb(supabase, societyId, noticeId, file) {
  const attId = cryptoRandomUUID();
  const ext = extensionForNoticeMime(file.type) ?? "bin";
  const storageKey = `${societyId}/notifications/${noticeId}/${attId}.${ext}`;

  const { error } = await supabase.storage.from(NOTICES_BUCKET).upload(storageKey, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;

  return {
    storageKey,
    mimeType: file.type || "application/octet-stream",
    byteSize: file.size ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function base64ToBytes(base64) {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

function extensionForNoticeMime(mime) {
  if (!mime) return null;
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  return null;
}
