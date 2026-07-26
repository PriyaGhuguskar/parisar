// Phase 5 isolation test helpers.
// Re-exports phase4.js primitives (clientForSession, signInAsBoard/Member,
// seedTestSociety, seeded society/flat IDs, test phones, adminClient, waitFor)
// and adds Phase 5 seed/teardown helpers for notifications, polls, bookings,
// preferences, and the push_deliveries delivery log.
//
// Seed helpers use the service-role adminClient so they bypass the REVOKE on the
// mutation tables (clients can only write through the RPCs; tests seed directly).
//
// JavaScript only — no TypeScript, no import type. Pure ESM.

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  adminClient,
  signInTestPhone,
  refreshSession,
  clientForSession,
  signInAsBoard,
  signInAsMember,
  seedTestSociety,
  waitFor,
  SOCIETY_A_ID,
  SOCIETY_B_ID,
  WING_A_ID,
  WING_B_ID,
  FLAT_A_101,
  FLAT_A_102,
  FLAT_B_101,
  FLAT_B_102,
  BOARD_A_PHONE,
  MEMBER_A_PHONE,
  BOARD_A2_PHONE,
  MEMBER_B_PHONE,
} from "./phase4.js";

export {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  adminClient,
  signInTestPhone,
  refreshSession,
  clientForSession,
  signInAsBoard,
  signInAsMember,
  seedTestSociety,
  waitFor,
  SOCIETY_A_ID,
  SOCIETY_B_ID,
  WING_A_ID,
  WING_B_ID,
  FLAT_A_101,
  FLAT_A_102,
  FLAT_B_101,
  FLAT_B_102,
  BOARD_A_PHONE,
  MEMBER_A_PHONE,
  BOARD_A2_PHONE,
  MEMBER_B_PHONE,
};

/**
 * Seed an amenity (with the Phase 5 ALTERed open_time/close_time columns)
 * directly via the admin client.
 *
 * @param {string} societyId
 * @param {{ name?: string, openTime?: string, closeTime?: string, isCustom?: boolean }} [opts]
 * @returns {Promise<string>} the amenity id
 */
export async function seedAmenity(societyId, opts = {}) {
  const { name = "Clubhouse", openTime = "06:00", closeTime = "22:00", isCustom = false } = opts;
  const admin = adminClient();
  const { data, error } = await admin
    .from("amenities")
    .insert({
      society_id: societyId,
      name,
      is_custom: isCustom,
      open_time: openTime,
      close_time: closeTime,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedAmenity: ${error.message}`);
  return data.id;
}

/**
 * Seed a notification row (service-role bypasses the REVOKE on notifications).
 *
 * @param {string} societyId
 * @param {string} authorId
 * @param {string|null} authorFlatId
 * @param {{ kind?: string, category?: string, title?: string, body?: string }} [opts]
 * @returns {Promise<string>} the notification id
 */
export async function seedNotification(societyId, authorId, authorFlatId, opts = {}) {
  const {
    kind = "general",
    category = "general",
    title = "Test notice",
    body = "Test body",
  } = opts;
  const admin = adminClient();
  const { data, error } = await admin
    .from("notifications")
    .insert({
      society_id: societyId,
      author_id: authorId,
      author_flat_id: authorFlatId,
      kind,
      category,
      title,
      body,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedNotification: ${error.message}`);
  return data.id;
}

/**
 * Seed a booking row directly, building the tstzrange from startsAt/endsAt ISO strings.
 *
 * @param {string} societyId
 * @param {string} amenityId
 * @param {string} requesterId
 * @param {{ startsAt: string, endsAt: string, status?: string, requesterFlatId?: string|null }} opts
 * @returns {Promise<string>} the booking id
 */
export async function seedBooking(societyId, amenityId, requesterId, opts) {
  const { startsAt, endsAt, status = "pending", requesterFlatId = null } = opts;
  const admin = adminClient();
  // Postgrest accepts the literal range text for a tstzrange column.
  const range = `[${startsAt},${endsAt})`;
  const { data, error } = await admin
    .from("bookings")
    .insert({
      society_id: societyId,
      amenity_id: amenityId,
      requester_id: requesterId,
      requester_flat_id: requesterFlatId,
      time_range: range,
      status,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedBooking: ${error.message}`);
  return data.id;
}

/**
 * Seed a push_deliveries log row (service-role only). Used to push a user up to
 * the rolling-24h cap. createdAt defaults to now.
 *
 * @param {string} societyId
 * @param {string} userId
 * @param {string} category
 * @param {string} [createdAt] ISO timestamp
 */
export async function seedPushDelivery(societyId, userId, category, createdAt = null) {
  const admin = adminClient();
  const row = { society_id: societyId, user_id: userId, category };
  if (createdAt) row.created_at = createdAt;
  const { error } = await admin.from("push_deliveries").insert(row);
  if (error) throw new Error(`seedPushDelivery: ${error.message}`);
}

/**
 * Seed N push_deliveries rows in one call (for cap tests).
 *
 * @param {string} societyId
 * @param {string} userId
 * @param {string} category
 * @param {number} count
 */
export async function seedPushDeliveries(societyId, userId, category, count) {
  const admin = adminClient();
  const rows = Array.from({ length: count }, () => ({
    society_id: societyId,
    user_id: userId,
    category,
  }));
  const { error } = await admin.from("push_deliveries").insert(rows);
  if (error) throw new Error(`seedPushDeliveries: ${error.message}`);
}

/**
 * UPSERT a notification_preferences row (service-role).
 *
 * @param {string} userId
 * @param {string} societyId
 * @param {object} prefs partial column overrides (mute_*, quiet_start, quiet_end, cap_per_day)
 */
export async function seedNotificationPreference(userId, societyId, prefs = {}) {
  const admin = adminClient();
  const { error } = await admin.from("notification_preferences").upsert(
    { user_id: userId, society_id: societyId, updated_at: new Date().toISOString(), ...prefs },
    { onConflict: "user_id,society_id" },
  );
  if (error) throw new Error(`seedNotificationPreference: ${error.message}`);
}

/**
 * Delete a notification_preferences row so a user resolves to VIEW defaults.
 */
export async function clearNotificationPreference(userId, societyId) {
  const admin = adminClient();
  await admin
    .from("notification_preferences")
    .delete()
    .eq("user_id", userId)
    .eq("society_id", societyId);
}

/**
 * FK-respecting teardown of Phase 5 test rows for the given societies.
 * Order: poll_votes → poll_options → polls → attachments(notification) →
 * notifications; push_deliveries; bookings; notification_preferences.
 * Phase 5-seeded amenities are deleted last (by society) — Phase 3 tests recreate
 * their own amenities and reset by society, so this is safe.
 *
 * @param {string|string[]} societyIds
 * @param {string[]} [userIds]
 */
export async function teardownPhase5(societyIds, userIds = []) {
  const admin = adminClient();
  const ids = Array.isArray(societyIds) ? societyIds : [societyIds];

  await admin.from("poll_votes").delete().in("society_id", ids);
  await admin.from("poll_options").delete().in("society_id", ids);
  await admin.from("polls").delete().in("society_id", ids);
  await admin
    .from("attachments")
    .delete()
    .in("society_id", ids)
    .eq("owner_kind", "notification");
  await admin.from("notifications").delete().in("society_id", ids);

  await admin.from("bookings").delete().in("society_id", ids);
  await admin.from("amenities").delete().in("society_id", ids);

  if (userIds.length > 0) {
    await admin.from("push_deliveries").delete().in("user_id", userIds);
    await admin.from("notification_preferences").delete().in("user_id", userIds);
    await admin.from("push_tokens").delete().in("user_id", userIds);
  } else {
    await admin.from("push_deliveries").delete().in("society_id", ids);
    await admin.from("notification_preferences").delete().in("society_id", ids);
  }
}
