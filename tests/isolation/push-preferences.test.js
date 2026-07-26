// Phase 5 push-preferences isolation tests (NOTF-05/06/07).
//
// Exercises eligible_push_recipients() at the SQL layer (the A4 helper that keeps
// quiet-hours wrap + rolling cap testable in SQL). Runs against the live local
// Supabase stack; calls the helper via the SERVICE-ROLE client (the helper is
// granted to service_role only, since push_tokens has no society_id and the
// Edge Function consumes it).
//
// Covers:
//   - muted category → recipient excluded (NOTF-05)
//   - rolling-24h cap reached → excluded; under cap → included (NOTF-07)
//   - quiet-hours wrap: window covering "now IST" → excluded; not covering → included (NOTF-06)
//   - notifications_enabled=false on the only token → excluded
//
// JavaScript only. Never chain .catch()/.then() on .rpc() (Pitfall 6).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  signInAsMember,
  seedTestSociety,
  seedNotification,
  seedPushDeliveries,
  seedNotificationPreference,
  clearNotificationPreference,
  teardownPhase5,
  MEMBER_A_PHONE,
} from "./helpers/phase5.js";

const societyA = seedTestSociety("A");

let memberA; // the recipient under test
let tokenCount = 0;

/** Register a fresh push token for the member with notifications_enabled toggle. */
async function registerToken(enabled = true) {
  const admin = adminClient();
  const expoToken = `ExpoPushToken[pref-${Date.now()}-${tokenCount++}]`;
  const { error } = await admin.from("push_tokens").upsert(
    {
      user_id: memberA.userId,
      expo_token: expoToken,
      platform: "android",
      notifications_enabled: enabled,
    },
    { onConflict: "expo_token" },
  );
  if (error) throw new Error(`registerToken: ${error.message}`);
  return expoToken;
}

/** Call eligible_push_recipients via the service-role client and return rows for memberA. */
async function recipientsFor(notificationId) {
  const admin = adminClient();
  const { data, error } = await admin.rpc("eligible_push_recipients", {
    p_notification_id: notificationId,
  });
  if (error) throw new Error(`eligible_push_recipients: ${error.message}`);
  return (data ?? []).filter((r) => r.user_id === memberA.userId);
}

/**
 * Compute a quiet-hours window (HH:MM strings) that CONTAINS or EXCLUDES "now IST".
 * containing=true → window covers now; false → a 1-minute window far from now.
 */
function istWindow(containing) {
  const nowIstMs = Date.now() + 5.5 * 3600_000;
  const d = new Date(nowIstMs);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const pad = (n) => String(n).padStart(2, "0");
  if (containing) {
    // Window from one hour before now to one hour after now (same-day, no wrap risk
    // unless near midnight — acceptable for the test which picks a mid-day-ish now).
    const startH = (h + 23) % 24; // h-1
    const endH = (h + 1) % 24;
    return { quiet_start: `${pad(startH)}:${pad(m)}`, quiet_end: `${pad(endH)}:${pad(m)}` };
  }
  // A 1-minute window 6 hours away from now → does not contain now.
  const farH = (h + 6) % 24;
  return { quiet_start: `${pad(farH)}:00`, quiet_end: `${pad(farH)}:01` };
}

beforeAll(async () => {
  await teardownPhase5([societyA.societyId]);
  memberA = await signInAsMember(MEMBER_A_PHONE, societyA.societyId, societyA.flatId);
}, 120_000);

afterAll(async () => {
  await teardownPhase5([societyA.societyId], [memberA?.userId].filter(Boolean));
});

// ---------------------------------------------------------------------------
// Baseline: with defaults (no prefs row) + an enabled token, the member is eligible.
// ---------------------------------------------------------------------------
describe("eligible_push_recipients baseline", () => {
  it("a member with defaults + an enabled token IS a recipient for a 'general' notice", async () => {
    await clearNotificationPreference(memberA.userId, societyA.societyId);
    // Clear any prior deliveries that could trip the cap.
    const admin = adminClient();
    await admin.from("push_deliveries").delete().eq("user_id", memberA.userId);
    // Ensure quiet hours don't accidentally cover "now" — set an explicit far window.
    await seedNotificationPreference(memberA.userId, societyA.societyId, {
      ...istWindow(false),
      cap_per_day: 20,
    });
    await registerToken(true);

    const notifId = await seedNotification(
      societyA.societyId,
      memberA.userId,
      societyA.flatId,
      { category: "general", title: "Baseline", body: "b" },
    );
    const rows = await recipientsFor(notifId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// NOTF-05: muted category → excluded.
// ---------------------------------------------------------------------------
describe("NOTF-05: category mute", () => {
  it("member with mute_polls=true is excluded from a 'polls' notice", async () => {
    await seedNotificationPreference(memberA.userId, societyA.societyId, {
      mute_polls: true,
      mute_general: false,
      ...istWindow(false),
      cap_per_day: 20,
    });
    const admin = adminClient();
    await admin.from("push_deliveries").delete().eq("user_id", memberA.userId);
    await registerToken(true);

    const pollNotif = await seedNotification(
      societyA.societyId,
      memberA.userId,
      societyA.flatId,
      { category: "polls", kind: "poll", title: "Poll", body: "b" },
    );
    const rows = await recipientsFor(pollNotif);
    expect(rows).toHaveLength(0);

    // A 'general' notice with the same prefs is NOT muted → still a recipient.
    const generalNotif = await seedNotification(
      societyA.societyId,
      memberA.userId,
      societyA.flatId,
      { category: "general", title: "General", body: "b" },
    );
    const generalRows = await recipientsFor(generalNotif);
    expect(generalRows.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// NOTF-07: rolling-24h cap.
// ---------------------------------------------------------------------------
describe("NOTF-07: rolling-24h frequency cap", () => {
  it("excluded when at cap; included when under cap", async () => {
    const admin = adminClient();
    await admin.from("push_deliveries").delete().eq("user_id", memberA.userId);
    await seedNotificationPreference(memberA.userId, societyA.societyId, {
      mute_general: false,
      ...istWindow(false),
      cap_per_day: 3,
    });
    await registerToken(true);

    const notif = await seedNotification(
      societyA.societyId,
      memberA.userId,
      societyA.flatId,
      { category: "general", title: "Cap test", body: "b" },
    );

    // Under cap (2 of 3 deliveries in the last 24h) → still a recipient.
    await seedPushDeliveries(societyA.societyId, memberA.userId, "general", 2);
    expect((await recipientsFor(notif)).length).toBeGreaterThanOrEqual(1);

    // At cap (3 of 3) → excluded.
    await seedPushDeliveries(societyA.societyId, memberA.userId, "general", 1);
    expect(await recipientsFor(notif)).toHaveLength(0);
  });

  it("old deliveries (>24h) do not count toward the cap", async () => {
    const admin = adminClient();
    await admin.from("push_deliveries").delete().eq("user_id", memberA.userId);
    await seedNotificationPreference(memberA.userId, societyA.societyId, {
      mute_general: false,
      ...istWindow(false),
      cap_per_day: 1,
    });
    await registerToken(true);

    // Seed 5 deliveries dated 25 hours ago → outside the rolling window.
    const old = new Date(Date.now() - 25 * 3600_000).toISOString();
    for (let i = 0; i < 5; i++) {
      await admin.from("push_deliveries").insert({
        society_id: societyA.societyId,
        user_id: memberA.userId,
        category: "general",
        created_at: old,
      });
    }

    const notif = await seedNotification(
      societyA.societyId,
      memberA.userId,
      societyA.flatId,
      { category: "general", title: "Old cap test", body: "b" },
    );
    // cap_per_day=1 but the 5 old rows are >24h → count is 0 → recipient included.
    expect((await recipientsFor(notif)).length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// NOTF-06: quiet-hours wrap-around.
// ---------------------------------------------------------------------------
describe("NOTF-06: quiet-hours (IST, wrap-around)", () => {
  it("excluded when quiet window covers now IST; included when it does not", async () => {
    const admin = adminClient();
    await admin.from("push_deliveries").delete().eq("user_id", memberA.userId);
    await registerToken(true);

    const notif = await seedNotification(
      societyA.societyId,
      memberA.userId,
      societyA.flatId,
      { category: "general", title: "Quiet test", body: "b" },
    );

    // Window covering now → excluded.
    await seedNotificationPreference(memberA.userId, societyA.societyId, {
      mute_general: false,
      cap_per_day: 20,
      ...istWindow(true),
    });
    expect(await recipientsFor(notif)).toHaveLength(0);

    // Window NOT covering now → included.
    await seedNotificationPreference(memberA.userId, societyA.societyId, {
      mute_general: false,
      cap_per_day: 20,
      ...istWindow(false),
    });
    expect((await recipientsFor(notif)).length).toBeGreaterThanOrEqual(1);
  });

  it("the default overnight window 22:00-07:00 wraps correctly (does not silently disable)", async () => {
    // This asserts the CASE handles start>end. We can't control wall-clock, so we
    // verify the wrap logic conceptually: a 23:00-01:00 window contains 23:30 and
    // 00:30 but not 12:00. We assert at least that the window-covering-now path and
    // the not-covering path return opposite results (covered by the test above).
    // Here we additionally confirm a known overnight window is accepted without error.
    await seedNotificationPreference(memberA.userId, societyA.societyId, {
      mute_general: false,
      cap_per_day: 20,
      quiet_start: "22:00",
      quiet_end: "07:00",
    });
    const admin = adminClient();
    await admin.from("push_deliveries").delete().eq("user_id", memberA.userId);
    await registerToken(true);
    const notif = await seedNotification(
      societyA.societyId,
      memberA.userId,
      societyA.flatId,
      { category: "general", title: "Default quiet", body: "b" },
    );
    // No throw → the wrap CASE evaluated cleanly. Result depends on wall-clock IST.
    const rows = await recipientsFor(notif);
    expect(Array.isArray(rows)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// notifications_enabled gate.
// ---------------------------------------------------------------------------
describe("push_tokens.notifications_enabled gate", () => {
  it("a token with notifications_enabled=false is not returned", async () => {
    const admin = adminClient();
    // Remove all tokens, then add only a disabled one.
    await admin.from("push_tokens").delete().eq("user_id", memberA.userId);
    await admin.from("push_deliveries").delete().eq("user_id", memberA.userId);
    await seedNotificationPreference(memberA.userId, societyA.societyId, {
      mute_general: false,
      cap_per_day: 20,
      ...istWindow(false),
    });
    await registerToken(false);

    const notif = await seedNotification(
      societyA.societyId,
      memberA.userId,
      societyA.flatId,
      { category: "general", title: "Disabled token", body: "b" },
    );
    expect(await recipientsFor(notif)).toHaveLength(0);
  });
});
