// Shared flat-action helpers used by BOTH the web and mobile Phase 6 flows.
// Single source of truth: all Supabase calls for flat actions (Warning / Fine /
// Notify) live in this module so neither client duplicates RPC signatures, the
// per-flat read shape, or the Realtime channel.
//
// All RPC param names match the migration in
// supabase/migrations/20260529000009_phase6_flat_actions_community.sql.
//
// D-05 per-flat privacy: RLS scopes reads server-side via can_see_flat_action
// (board sees all flats; a resident sees ONLY their own flat). The client never
// filters by flat — it renders exactly what the RLS-scoped query returns.
//
// supabase-js v2 thenable quirk (06-RESEARCH Pitfall 1): NEVER attach `.catch` to
// a builder chain. Always `const { data, error } = await ...` then branch on error.
// RPCs that return business outcomes (acknowledge {ok, reason}) are returned as the
// jsonb straight through — do NOT throw on a typed business result.
//
// Functions exported:
//   1. listFlatActions(supabase, { flatId })
//   2. getFlatAction(supabase, id)
//   3. issueFlatAction(supabase, opts)                        ← admin-only server-side
//   4. acknowledgeFine(supabase, id)                          ← jsonb pass-through
//   5. waiveFine(supabase, id)                                ← admin-only; INSUFFICIENT_ROLE → typed result
//   6. uploadFinePdf(supabase, opts)                          ← mobile; owner_kind='flat_action'
//   7. uploadFinePdfWeb(supabase, opts)                       ← web
//   8. subscribeFlatActions(supabase, { societyId, flatId, onInsert })
//   9. subscribeFlatAction(supabase, { id, onUpdate })

import {
  FINE_STATUS,
  FINE_STATUS_LABELS,
  FLAT_ACTION_KIND,
  FLAT_ACTION_KIND_LABELS,
} from "@parisar/shared-types";

// Re-export enum constants alongside the API so callers can do:
//   import { issueFlatAction, FLAT_ACTION_KIND } from '@parisar/api-client';
export { FINE_STATUS, FINE_STATUS_LABELS, FLAT_ACTION_KIND, FLAT_ACTION_KIND_LABELS };

// Storage bucket for fine PDF attachments. Shared with complaints/notices (Phase 1).
export const FLAT_ACTIONS_BUCKET = "parisar-attachments";

// FLAT-04 defensive cap: a fine attachment PDF is capped at 10 MB (matches the
// UI-SPEC flatAction.pdfTooLarge copy + the Phase 5 notice-attachment limit).
export const FINE_PDF_MAX_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Reads (RLS scopes server-side: resident sees own flat; board sees all — D-05)
// ---------------------------------------------------------------------------

/**
 * List flat actions for a flat (member view) or the whole society (board view).
 *
 * RLS (can_see_flat_action) already enforces per-flat visibility — a member only
 * ever receives their own flat's rows even with no `flatId` filter. The optional
 * `flatId` narrows the board's society-wide view to a single flat (the board
 * per-flat filter, Screen 3). Newest first.
 *
 * Embeds issuer profile + issuer flat for the "Issued by Amit (A-102)" attribution
 * (FLAT-02), plus the target flat for the board's multi-flat list.
 *
 * @param {object} supabase
 * @param {{ flatId?: string|null, limit?: number, cursor?: string|null }} [opts]
 * @returns {Promise<Array>} flat_action rows with embedded issuer/issuer_flat/flat
 */
export async function listFlatActions(supabase, { flatId = null, limit = 30, cursor = null } = {}) {
  let q = supabase
    .from("flat_actions")
    .select(
      `
        id,
        society_id,
        flat_id,
        issuer_id,
        issuer_flat_id,
        kind,
        body,
        amount,
        due_date,
        fine_status,
        created_at,
        issuer:issuer_id ( user_id, full_name ),
        issuer_flat:issuer_flat_id ( number, wing:wing_id ( name ) ),
        flat:flat_id ( number, wing:wing_id ( name ) )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (flatId) {
    q = q.eq("flat_id", flatId);
  }
  if (cursor) {
    q = q.lt("created_at", cursor);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch a single flat action with issuer/flat embeds + its attachments (fine PDF).
 *
 * Two reads (PostgREST can't embed polymorphic attachments).
 *
 * @param {object} supabase
 * @param {string} id - flat_action UUID
 * @returns {Promise<{ action: object, attachments: Array }>}
 */
export async function getFlatAction(supabase, id) {
  const { data: action, error: aErr } = await supabase
    .from("flat_actions")
    .select(
      `
        *,
        issuer:issuer_id ( user_id, full_name ),
        issuer_flat:issuer_flat_id ( number, wing:wing_id ( name ) ),
        flat:flat_id ( number, wing:wing_id ( name ) )
      `,
    )
    .eq("id", id)
    .single();
  if (aErr) throw aErr;

  const { data: attachments, error: atErr } = await supabase
    .from("attachments")
    .select("id, storage_key, mime_type, byte_size, created_by, created_at")
    .eq("owner_kind", "flat_action")
    .eq("owner_id", id);
  if (atErr) throw atErr;

  return { action, attachments: attachments ?? [] };
}

// ---------------------------------------------------------------------------
// Writes (SECURITY DEFINER RPCs — direct table writes are REVOKED; the RPC gates
// admin-only issue/waive server-side per D-04/D-05)
// ---------------------------------------------------------------------------

/**
 * Issue a flat action (Warning / Fine / Notify) against a flat.
 *
 * The RPC is admin-only (secretary/co_secretary) — a non-admin call raises
 * INSUFFICIENT_ROLE. A fine requires a positive amount + due date
 * (FINE_FIELDS_REQUIRED otherwise). The attachment (fine PDF) must be uploaded
 * FIRST (see {@link uploadFinePdf}) so its storage key + mime + byte size flow in.
 *
 * Calls: issue_flat_action(p_flat_id, p_kind, p_body, p_amount, p_due_date,
 *                          p_action_id, p_storage_key, p_mime_type, p_byte_size)
 *
 * Pass `actionId` (a client-generated UUID) when attaching a fine PDF: the PDF must be
 * uploaded BEFORE this RPC (see {@link uploadFinePdf}) under the prefix
 * {society}/flat_actions/{actionId}/, so the action id has to be known up front. When
 * omitted, the server defaults p_action_id to gen_random_uuid(). The RPC returns
 * `flat_action_id` + `society_id`.
 *
 * @param {object} supabase
 * @param {{
 *   flatId: string,
 *   kind: 'warning'|'fine'|'notify',
 *   body: string,
 *   amount?: number|null,
 *   dueDate?: string|null,        // ISO date 'YYYY-MM-DD'
 *   actionId?: string|null,       // client-generated UUID (required to attach a fine PDF)
 *   storageKey?: string|null,
 *   mimeType?: string|null,
 *   byteSize?: number|null,
 * }} opts
 * @returns {Promise<{ actionId: string, societyId: string }>}
 */
export async function issueFlatAction(
  supabase,
  {
    flatId,
    kind,
    body,
    amount = null,
    dueDate = null,
    actionId = null,
    storageKey = null,
    mimeType = null,
    byteSize = null,
  },
) {
  const params = {
    p_flat_id: flatId,
    p_kind: kind,
    p_body: body,
    p_amount: amount,
    p_due_date: dueDate,
    p_storage_key: storageKey,
    p_mime_type: mimeType,
    p_byte_size: byteSize,
  };
  // Only forward p_action_id when supplied so the server default applies otherwise.
  if (actionId) params.p_action_id = actionId;

  const { data, error } = await supabase.rpc("issue_flat_action", params);
  if (error) throw error;
  // The RPC returns { flat_action_id, society_id } (NOT action_id).
  return { actionId: data.flat_action_id, societyId: data.society_id };
}

/**
 * Acknowledge a fine ("I've seen it" — D-04). Member-resident only (server-gated).
 *
 * The RPC returns a typed jsonb result ({ ok, reason } / { ok, status }) that this
 * wrapper passes through CLEANLY — it never throws for the business outcome. Only a
 * genuine transport/RLS error throws.
 *
 * Calls: acknowledge_fine(p_action_id)
 *
 * @param {object} supabase
 * @param {string} id - flat_action UUID
 * @returns {Promise<object>} the RPC jsonb result
 */
export async function acknowledgeFine(supabase, id) {
  const { data, error } = await supabase.rpc("acknowledge_fine", { p_action_id: id });
  if (error) throw error;
  return data;
}

/**
 * Waive a fine (board admin-only — D-04; marks the fine closed/inert).
 *
 * The RPC gates admin-only (secretary/co_secretary) and raises INSUFFICIENT_ROLE
 * for any other role. Because the UI surfaces this as a clean inline message (not a
 * crash), we translate the role exception into a typed result
 * `{ ok: false, reason: 'insufficient_role' }` rather than re-throwing it. Any other
 * (transport/RLS) error still throws so the UI can show the generic retry copy.
 *
 * Calls: waive_fine(p_action_id)
 *
 * @param {object} supabase
 * @param {string} id - flat_action UUID
 * @returns {Promise<object>} the RPC jsonb result, or {ok:false, reason:'insufficient_role'}
 */
export async function waiveFine(supabase, id) {
  const { data, error } = await supabase.rpc("waive_fine", { p_action_id: id });
  if (error) {
    if (isRoleError(error)) {
      return { ok: false, reason: "insufficient_role" };
    }
    throw error;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Fine PDF attachment (FLAT-04 — reuses the Phase 5 NoticeComposer PDF chain)
// owner_kind = 'flat_action'. Upload BEFORE issue_flat_action so the storage key
// flows into the RPC (the action id is the attachment owner_id).
// ---------------------------------------------------------------------------

/**
 * MOBILE ONLY — pick a bylaw / AGM-resolution PDF and upload it for a fine.
 *
 * Dynamically imports expo-document-picker + expo-file-system so the web bundle does
 * not pull native modules. Web callers must use {@link uploadFinePdfWeb}.
 *
 * Storage key format (RLS-enforced prefix):
 *   {societyId}/flat_actions/{actionId}/{fileUuid}.pdf
 *
 * @param {object} supabase
 * @param {{ societyId: string, actionId: string }} opts
 * @returns {Promise<{ storageKey: string, mimeType: string, byteSize: number } | null>}
 *   null if the user cancelled.
 * @throws if the picked file exceeds FINE_PDF_MAX_BYTES (caller maps to pdfTooLarge).
 */
export async function uploadFinePdf(supabase, { societyId, actionId }) {
  const DocumentPicker = await import(/* webpackIgnore: true */ "expo-document-picker");
  const FileSystem = await import(/* webpackIgnore: true */ "expo-file-system");

  const picked = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];

  const size = asset.size ?? 0;
  if (size > FINE_PDF_MAX_BYTES) {
    throw new Error("PDF_TOO_LARGE");
  }

  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const fileId = cryptoRandomUUID();
  const storageKey = `${societyId}/flat_actions/${actionId}/${fileId}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(FLAT_ACTIONS_BUCKET)
    .upload(storageKey, bytes.buffer, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  return { storageKey, mimeType: "application/pdf", byteSize: bytes.length };
}

/**
 * WEB ONLY — upload a PDF File/Blob from an `<input type="file" accept="application/pdf">`.
 *
 * @param {object} supabase
 * @param {{ societyId: string, actionId: string, file: File|Blob }} opts
 * @returns {Promise<{ storageKey: string, mimeType: string, byteSize: number }>}
 * @throws if the file exceeds FINE_PDF_MAX_BYTES.
 */
export async function uploadFinePdfWeb(supabase, { societyId, actionId, file }) {
  if ((file.size ?? 0) > FINE_PDF_MAX_BYTES) {
    throw new Error("PDF_TOO_LARGE");
  }
  const fileId = cryptoRandomUUID();
  const storageKey = `${societyId}/flat_actions/${actionId}/${fileId}.pdf`;

  const { error } = await supabase.storage.from(FLAT_ACTIONS_BUCKET).upload(storageKey, file, {
    contentType: file.type || "application/pdf",
    upsert: false,
  });
  if (error) throw error;

  return {
    storageKey,
    mimeType: file.type || "application/pdf",
    byteSize: file.size ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Realtime subscriptions (flat_actions is in the supabase_realtime publication)
// ---------------------------------------------------------------------------

/**
 * Subscribe to new flat actions (FLAT-03 in-app realtime).
 *
 * - Member view: pass `flatId` → INSERT filtered to the member's own flat. RLS
 *   ALSO enforces per-flat visibility server-side (D-05), so even without the
 *   filter a member would only receive their own flat's events; the filter just
 *   avoids waking the client for other flats the board can see.
 * - Board view: omit `flatId` → INSERT scoped to the whole society.
 *
 * @param {object} supabase
 * @param {{ societyId: string, flatId?: string|null, onInsert?: Function, onConnected?: Function }} opts
 * @returns {Function} cleanup — call on unmount/blur
 */
export function subscribeFlatActions(
  supabase,
  { societyId, flatId = null, onInsert, onConnected },
) {
  const channelName = flatId ? `flat-actions-${societyId}-${flatId}` : `flat-actions-${societyId}`;
  const filter = flatId ? `flat_id=eq.${flatId}` : `society_id=eq.${societyId}`;

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "flat_actions", filter },
      (payload) => onInsert?.(payload.new),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        onConnected?.();
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to a single flat action's UPDATE (status changes — acknowledge/waive)
 * for the detail screen.
 *
 * @param {object} supabase
 * @param {{ id: string, onUpdate?: Function }} opts
 * @returns {Function} cleanup
 */
export function subscribeFlatAction(supabase, { id, onUpdate }) {
  const channel = supabase
    .channel(`flat-action-${id}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "flat_actions", filter: `id=eq.${id}` },
      (payload) => onUpdate?.(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** True when a Supabase RPC error is the admin-only role gate (INSUFFICIENT_ROLE). */
function isRoleError(error) {
  const msg = (error && (error.message || error.code || "")).toString();
  return msg.includes("INSUFFICIENT_ROLE");
}

/**
 * Cross-runtime UUID generator (Node 19+, browsers, RN via expo-crypto polyfill).
 * Falls back to a v4-shaped string built from getRandomValues.
 */
function cryptoRandomUUID() {
  const g = globalThis.crypto;
  if (g && typeof g.randomUUID === "function") {
    return g.randomUUID();
  }
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
