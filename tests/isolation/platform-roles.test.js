/**
 * Platform role matrix — admin / sales / staff.
 *
 * WHY THIS FILE EXISTS. Migration …044 added 'staff' to the platform_role enum.
 * The gate that guards the seven shared platform RPCs used to be
 * is_platform_staff(), whose body asked "does a row exist in platform_admins"
 * rather than "is the role one of these". That was correct while the enum held
 * exactly ('admin','sales'). The moment 'staff' existed it silently became
 * wrong: a role meant to carry no capability at all would have arrived able to
 * create societies, price features, edit chairmen and work the enrollment queue.
 *
 * Nothing would have failed. No error, no warning — the gate just gets wider.
 * That is precisely the class of bug a test has to catch, because review will
 * not: the dangerous line is the one that DIDN'T change.
 *
 * …045 replaced it with is_platform_admin_or_sales(). This file is the proof,
 * and the tripwire if anyone ever "simplifies" it back.
 *
 * JavaScript only — no TypeScript, no import type.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, signInTestPhone } from "./helpers/phase3.js";

// Manual-QA pool. 001-004 are taken by other isolation files, 005-007 are
// reserved for Phase 6 manual QA. Signing in is rate limited per IP
// (sign_in_sign_ups = 10 per 5 min) and the whole suite shares one IP
// sequentially, so every identity is signed in ONCE here and reused.
const PHONE = {
  admin: "9000000010",
  sales: "9000000011",
  staff: "9000000012",
  resident: "9000000013",
};

/** Promote a signed-in user to a platform role. Service role — the table has no policies. */
async function setPlatformRole(userId, role) {
  const { error } = await adminClient()
    .from("platform_admins")
    .upsert({ user_id: userId, role, note: "isolation test" }, { onConflict: "user_id" });
  if (error) throw new Error(`could not set platform role ${role}: ${error.message}`);
}

/**
 * Call an RPC and describe the outcome as a plain string, so a test can assert
 * on "blocked with NOT_PLATFORM_STAFF" rather than juggling error shapes.
 */
async function callRpc(client, fn, args = {}) {
  const { error } = await client.rpc(fn, args);
  return error ? `blocked:${error.message}` : "allowed";
}

let admin;
let sales;
let staff;
let resident;
const createdUserIds = [];

beforeAll(async () => {
  admin = await signInTestPhone(PHONE.admin, "member");
  sales = await signInTestPhone(PHONE.sales, "member");
  staff = await signInTestPhone(PHONE.staff, "member");
  resident = await signInTestPhone(PHONE.resident, "member");
  createdUserIds.push(admin.userId, sales.userId, staff.userId, resident.userId);

  await setPlatformRole(admin.userId, "admin");
  await setPlatformRole(sales.userId, "sales");
  await setPlatformRole(staff.userId, "staff");
  // resident deliberately gets no platform_admins row.
}, 120_000);

afterAll(async () => {
  const sb = adminClient();
  await sb.from("platform_admins").delete().in("user_id", createdUserIds);
});

// ---------------------------------------------------------------------------

describe("the helper predicates", () => {
  it("classify each role exactly once", async () => {
    const rows = await Promise.all(
      [
        ["admin", admin],
        ["sales", sales],
        ["staff", staff],
        ["resident", resident],
      ].map(async ([label, who]) => {
        const [role, isUser, adminOrSales, isAdmin] = await Promise.all([
          who.client.rpc("platform_role_of"),
          who.client.rpc("is_platform_user"),
          who.client.rpc("is_platform_admin_or_sales"),
          who.client.rpc("is_platform_admin"),
        ]);
        return [
          label,
          {
            role: role.data,
            isUser: isUser.data,
            adminOrSales: adminOrSales.data,
            isAdmin: isAdmin.data,
          },
        ];
      }),
    );

    expect(Object.fromEntries(rows)).toEqual({
      admin: { role: "admin", isUser: true, adminOrSales: true, isAdmin: true },
      sales: { role: "sales", isUser: true, adminOrSales: true, isAdmin: false },
      // THE LOAD-BEARING ROW. adminOrSales must be false: staff has no
      // capability until the access-grant module ships.
      staff: { role: "staff", isUser: true, adminOrSales: false, isAdmin: false },
      resident: { role: null, isUser: false, adminOrSales: false, isAdmin: false },
    });
  });

  it("no longer expose the old is_platform_staff name", async () => {
    // Dropped in …045. If someone re-adds it as a convenience alias, the
    // ambiguity it created comes straight back.
    const { error } = await admin.client.rpc("is_platform_staff");
    expect(error).toBeTruthy();
  });
});

describe("staff can reach none of the shared platform RPCs", () => {
  // The seven that is_platform_admin_or_sales() guards. If a new shared RPC is
  // added and gated on the wrong helper, add it here and watch it fail.
  const SHARED_RPCS = [
    ["admin_list_societies", {}],
    ["admin_stats", {}],
    ["admin_society_detail", { p_society_id: "00000000-0000-4000-8000-000000000001" }],
    ["admin_add_note", { p_society_id: "00000000-0000-4000-8000-000000000001", p_body: "x" }],
    [
      "admin_set_feature",
      {
        p_society_id: "00000000-0000-4000-8000-000000000001",
        p_feature_key: "complaints",
        p_enabled: true,
      },
    ],
    [
      "admin_update_chairman",
      {
        p_society_id: "00000000-0000-4000-8000-000000000001",
        p_name: "X Y",
        p_phone: "9000000099",
      },
    ],
    [
      "admin_create_society",
      {
        p_name: "Test Society",
        p_address_line: "1 Test Road",
        p_city: "Pune",
        p_state: "MH",
        p_pincode: "411001",
        p_landmark: null,
        p_authorities: [{ name: "X Y", phone: "9000000099" }],
      },
    ],
    // Society Authorities (…048) — staff-side authority management.
    ["admin_society_authorities", { p_society_id: "00000000-0000-4000-8000-000000000001" }],
    [
      "admin_add_society_authority",
      {
        p_society_id: "00000000-0000-4000-8000-000000000001",
        p_name: "X Y",
        p_phone: "9000000099",
      },
    ],
    [
      "admin_update_society_authority",
      {
        p_authority_id: "00000000-0000-4000-8000-000000000001",
        p_name: "X Y",
        p_phone: "9000000099",
      },
    ],
  ];

  for (const [fn, args] of SHARED_RPCS) {
    it(`${fn} rejects staff`, async () => {
      expect(await callRpc(staff.client, fn, args)).toBe("blocked:NOT_PLATFORM_STAFF");
    });
  }

  it("but sales can call them", async () => {
    // The point of the narrowing was to exclude staff WITHOUT changing what
    // sales could already do. This is the other half of that claim.
    expect(await callRpc(sales.client, "admin_list_societies")).toBe("allowed");
    expect(await callRpc(sales.client, "admin_stats")).toBe("allowed");
  });
});

describe("admin-only capabilities stay admin-only", () => {
  const ADMIN_RPCS = [
    ["admin_set_feature_price", { p_feature_key: "complaints", p_price: 100 }],
    ["admin_start_view", { p_society_id: "00000000-0000-4000-8000-000000000001" }],
    [
      "admin_record_payment",
      {
        p_society_id: "00000000-0000-4000-8000-000000000001",
        p_amount: 100,
        p_paid_on: "2026-01-01",
        p_method: "upi",
      },
    ],
  ];

  for (const [fn, args] of ADMIN_RPCS) {
    it(`${fn} rejects sales and staff`, async () => {
      expect(await callRpc(sales.client, fn, args)).toBe("blocked:NOT_PLATFORM_ADMIN");
      expect(await callRpc(staff.client, fn, args)).toBe("blocked:NOT_PLATFORM_ADMIN");
    });
  }

  it("admin_viewing_society returns null for sales and staff", async () => {
    // …045 replaced this function's inline platform_admins lookup — which had no
    // role filter — with is_platform_admin(). It is the predicate that unlocks
    // fourteen read policies over resident data, so it must not be the one place
    // that decides membership for itself.
    for (const who of [sales, staff, resident]) {
      const { data } = await who.client.rpc("admin_viewing_society");
      expect(data).toBeNull();
    }
  });
});

describe("appointing platform users", () => {
  it("admin can appoint a staff user", async () => {
    const { error } = await admin.client.rpc("admin_create_platform_user", {
      p_user_id: resident.userId,
      p_role: "staff",
    });
    expect(error).toBeNull();

    const { data } = await resident.client.rpc("platform_role_of");
    expect(data).toBe("staff");

    // Put it back so later assertions see a clean resident.
    await admin.client.rpc("admin_revoke_platform_user", { p_user_id: resident.userId });
    const { data: after } = await resident.client.rpc("platform_role_of");
    expect(after).toBeNull();
  });

  it("admin cannot appoint another admin", async () => {
    // The escalation guard. A compromised admin account can hand out sales and
    // staff access — recoverable, audited, revocable by any admin. What it must
    // not be able to do is mint a second permanent admin, because that survives
    // losing control of the first account.
    expect(
      await callRpc(admin.client, "admin_create_platform_user", {
        p_user_id: resident.userId,
        p_role: "admin",
      }),
    ).toBe("blocked:CANNOT_CREATE_ADMIN");
  });

  it("admin cannot demote or revoke a sitting admin", async () => {
    // Escalation's mirror image: rewriting an admin's row to 'staff' via the
    // upsert would be a way to seize control rather than share it.
    expect(
      await callRpc(admin.client, "admin_create_platform_user", {
        p_user_id: admin.userId,
        p_role: "staff",
      }),
    ).toBe("blocked:CANNOT_MODIFY_ADMIN");

    expect(
      await callRpc(admin.client, "admin_revoke_platform_user", { p_user_id: admin.userId }),
    ).toBe("blocked:CANNOT_MODIFY_ADMIN");
  });

  it("sales and staff cannot appoint anyone", async () => {
    for (const who of [sales, staff, resident]) {
      expect(
        await callRpc(who.client, "admin_create_platform_user", {
          p_user_id: resident.userId,
          p_role: "sales",
        }),
      ).toBe("blocked:NOT_PLATFORM_ADMIN");
    }
  });

  it("the user list never discloses an admin row", async () => {
    // …016's rule was "an admin cannot see the admin list". That is relaxed for
    // staff and sales, who now have to be manageable from the console — but not
    // for admins, who stay unenumerable.
    const { data, error } = await admin.client.rpc("admin_list_platform_users");
    expect(error).toBeNull();
    expect(data.map((r) => r.role).sort()).toEqual(["sales", "staff"]);
    expect(data.some((r) => r.user_id === admin.userId)).toBe(false);
  });

  it("nobody but an admin can list platform users", async () => {
    for (const who of [sales, staff, resident]) {
      expect(await callRpc(who.client, "admin_list_platform_users")).toBe(
        "blocked:NOT_PLATFORM_ADMIN",
      );
    }
  });
});

describe("platform_admins remains opaque to its own subjects", () => {
  it("no platform role can read the table directly", async () => {
    // Every console read goes through a SECURITY DEFINER RPC. This fires the
    // moment someone "fixes" a missing field by adding a policy to the table.
    for (const who of [admin, sales, staff, resident]) {
      const { error } = await who.client.from("platform_admins").select("user_id, role");
      // `revoke all ... from anon, authenticated` in …016 means this is a hard
      // permission denial (42501), NOT an RLS empty set. An earlier version of
      // this test asserted the empty set and passed only because it folded the
      // error away — assert the stronger guarantee that actually holds, so a
      // future GRANT that downgraded it to a filtered read would fail here.
      expect(error?.code).toBe("42501");
    }
  });
});

describe("platform staff hold no tenant data access", () => {
  // The console reads societies through definer RPCs on purpose. A platform
  // role must not pick up resident data by way of an ordinary tenant policy.
  // Table name AND a column that actually exists on it. The first draft of this
  // test queried a "notices" table (there is none — it is "notifications") and
  // selected "id" from profiles (which is keyed on user_id). Both errored, and
  // both still passed, because the assertion swallowed the error.
  const TENANT_TABLES = [
    ["complaints", "id"],
    ["notifications", "id"],
    ["society_memberships", "id"],
  ];

  for (const [table, column] of TENANT_TABLES) {
    it(`${table} returns nothing to admin, sales or staff`, async () => {
      for (const who of [admin, sales, staff]) {
        const { data, error } = await who.client.from(table).select(column).limit(5);
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
    });
  }

  it("profiles exposes only the caller's own row, never another person's", async () => {
    // profiles is the exception: a self-read policy lets any authenticated user
    // read their OWN row, and every platform user has one from signup. So the
    // contract here is not "zero rows" — it is "nobody else's row". Asserting
    // emptiness would be asserting something false about the schema.
    for (const who of [admin, sales, staff]) {
      const { data, error } = await who.client.from("profiles").select("user_id").limit(50);
      expect(error).toBeNull();
      expect(data.map((r) => r.user_id)).toEqual([who.userId]);
    }
  });
});

describe("the platform audit trail is readable", () => {
  // Appointment rows are written with society_id NULL, and the only SELECT
  // policy on audit_log matches `society_id = current_society_id()` — which can
  // never be true for NULL. Without a dedicated reader these rows would be
  // written and then visible to nobody but the service role, which would make
  // "every grant is audited" an unverifiable claim.
  it("records an appointment and its revocation, newest first", async () => {
    await admin.client.rpc("admin_create_platform_user", {
      p_user_id: resident.userId,
      p_role: "sales",
    });
    await admin.client.rpc("admin_revoke_platform_user", { p_user_id: resident.userId });

    const { data, error } = await admin.client.rpc("admin_list_platform_audit", { p_limit: 10 });
    expect(error).toBeNull();

    const mine = data.filter((r) => r.target_id === resident.userId);
    expect(mine[0].action).toBe("platform_user.revoked");
    expect(mine[1].action).toBe("platform_user.appointed");
    expect(mine[1].payload.role).toBe("sales");
    expect(mine[0].actor_id).toBe(admin.userId);
  });

  it("is admin-only", async () => {
    for (const who of [sales, staff, resident]) {
      expect(await callRpc(who.client, "admin_list_platform_audit")).toBe(
        "blocked:NOT_PLATFORM_ADMIN",
      );
    }
  });
});

describe("appointment input validation", () => {
  it("rejects a null role with a coded error, not a constraint violation", async () => {
    expect(
      await callRpc(admin.client, "admin_create_platform_user", {
        p_user_id: resident.userId,
        p_role: null,
      }),
    ).toBe("blocked:INVALID_ROLE");
  });

  it("rejects an unknown user with a coded error, not an FK violation", async () => {
    expect(
      await callRpc(admin.client, "admin_create_platform_user", {
        p_user_id: "00000000-0000-4000-8000-0000000000ff",
        p_role: "staff",
      }),
    ).toBe("blocked:USER_NOT_FOUND");
  });

  it("reports NOT_FOUND when revoking someone who holds no platform role", async () => {
    expect(
      await callRpc(admin.client, "admin_revoke_platform_user", { p_user_id: resident.userId }),
    ).toBe("blocked:NOT_FOUND");
  });
});
