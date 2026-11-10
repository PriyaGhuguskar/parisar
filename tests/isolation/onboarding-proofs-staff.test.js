/**
 * Society onboarding: proofs bucket and staff details. Migrations 067, 071.
 * Runs against the real database with throwaway users.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  clearRateBuckets,
  codeOf,
  createFixture,
} from "./helpers/onboarding.js";

const fx = createFixture();
let staff;
let a;
let b;
let owner; // active owner of A-101

const _tomorrow = () => new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  await clearRateBuckets([
    "rpc:tenant_register",
    "rpc:household_lookup",
    "rpc:household_request",
    "rpc:family_token",
    "rpc:family_invite",
  ]);
  staff = await fx.staff();
  a = await fx.society(staff);
  b = await fx.society(staff);
  owner = await fx.user(undefined, { name: "Rahul Sharma" });
  await fx.seat(a, owner, "101");
}, 180_000);

afterAll(async () => {
  await fx.cleanup();
}, 120_000);

describe("proofs bucket", () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  let ownerId;
  let path;

  const upload = (user, name, society = a.id, as = user.id) =>
    user.client.storage
      .from("parisar-proofs")
      .upload(`${society}/${as}/${name}`, png, { contentType: "image/png" });

  beforeAll(async () => {
    const saved = await owner.rpc("owner_save_my_details", {
      p_flat_id: a.flats["101"],
      p_full_name: "Rahul Sharma",
      p_is_primary: true,
    });
    if (saved.error) throw saved.error;
    ownerId = saved.data.id;
    path = `${a.id}/${owner.id}/deed.png`;
  }, 60_000);

  it("the bucket is private", async () => {
    const { data } = await anonClient().storage.from("parisar-proofs").getPublicUrl(path);
    const res = await fetch(data.publicUrl);
    expect(res.status).toBeGreaterThanOrEqual(400);
    const { data: bucket } = await adminClient().storage.getBucket("parisar-proofs");
    expect(bucket.public).toBe(false);
  });

  it("the uploader writes only to their own folder in a society they belong to", async () => {
    const ok = await upload(owner, "deed.png");
    expect(ok.error).toBeNull();
    fx.objects.push(path);

    expect((await upload(owner, "x.png", a.id, a.authority.id)).error).not.toBeNull();
    expect((await upload(owner, "x.png", b.id)).error).not.toBeNull();
    const outsider = await fx.user();
    expect((await upload(outsider, "x.png")).error).not.toBeNull();
    const bad = await owner.client.storage
      .from("parisar-proofs")
      .upload(`${a.id}/${owner.id}/x.html`, "<x>", {
        contentType: "text/html",
      });
    expect(bad.error).not.toBeNull();
  });

  it("read is the uploader and that society's managers only", async () => {
    const read = (user) => user.client.storage.from("parisar-proofs").download(path);
    expect((await read(owner)).error).toBeNull();
    expect((await read(a.authority)).error).toBeNull();

    const neighbour = await fx.user();
    await fx.seat(a, neighbour, "103");
    expect((await read(neighbour)).error).not.toBeNull();
    expect((await read(b.authority)).error).not.toBeNull();
    expect((await read(staff)).error).not.toBeNull();
    const signed = await b.authority.client.storage
      .from("parisar-proofs")
      .createSignedUrl(path, 60);
    expect(signed.error).not.toBeNull();
  });

  it("attach_proof needs a real uploaded file of your own on a subject you may touch", async () => {
    const attach = (user, over = {}) =>
      user.rpc("attach_proof", {
        p_subject_kind: "owner",
        p_subject_id: ownerId,
        p_doc_type: "sale_deed",
        p_storage_path: path,
        p_file_name: "deed.png",
        ...over,
      });
    expect(codeOf(await attach(owner, { p_storage_path: `${a.id}/${owner.id}/missing.png` }))).toBe(
      "PROOF_NOT_UPLOADED",
    );
    expect(codeOf(await attach(owner, { p_storage_path: `${b.id}/${owner.id}/deed.png` }))).toBe(
      "INVALID_PROOF_PATH",
    );
    expect(codeOf(await attach(owner, { p_doc_type: "selfie" }))).toBe("INVALID_DOC_TYPE");
    expect(codeOf(await attach(b.authority))).toBe("SUBJECT_NOT_FOUND");

    const ok = await attach(owner);
    expect(ok.error).toBeNull();
    expect(codeOf(await attach(owner))).toBe("PROOF_ALREADY_ATTACHED");

    const list = await a.authority.rpc("list_proofs", {
      p_subject_kind: "owner",
      p_subject_id: ownerId,
    });
    expect(list.data[0]).toEqual(
      expect.objectContaining({ doc_type: "sale_deed", mime_type: "image/png" }),
    );
    expect(
      codeOf(
        await b.authority.rpc("list_proofs", { p_subject_kind: "owner", p_subject_id: ownerId }),
      ),
    ).toBe("SUBJECT_NOT_FOUND");

    expect(codeOf(await b.authority.rpc("remove_proof", { p_document_id: ok.data.id }))).toBe(
      "PROOF_NOT_FOUND",
    );
    expect((await owner.rpc("remove_proof", { p_document_id: ok.data.id })).data.deleted).toBe(
      ok.data.id,
    );
  });

  it("a pending tenant may upload, then loses the write path once rejected", async () => {
    const t = await fx.user();
    const reg = await t.rpc("tenant_register", {
      p_code: a.code,
      p_flat_id: a.flats["104"],
      p_full_name: t.name,
    });
    const up = await upload(t, "agreement.png");
    expect(up.error).toBeNull();
    fx.objects.push(`${a.id}/${t.id}/agreement.png`);
    const att = await t.rpc("attach_proof", {
      p_subject_kind: "tenant",
      p_subject_id: reg.data.id,
      p_doc_type: "rent_agreement",
      p_storage_path: `${a.id}/${t.id}/agreement.png`,
    });
    expect(att.error).toBeNull();

    await a.authority.rpc("tenant_admin_decide", {
      p_tenant_id: reg.data.id,
      p_approve: false,
      p_reason: "Wrong flat",
    });
    expect((await upload(t, "again.png")).error).not.toBeNull();
  });
});

describe("staff details", () => {
  let staffId;

  it("a manager saves private details; residents read the contact list only", async () => {
    const res = await a.authority.rpc("manager_save_staff", {
      p_society_id: a.id,
      p_name: "Sunil",
      p_category: "maintenance_staff",
      p_phone: "9822334455",
      p_last_name: "Kale",
      p_email: "sunil@example.test",
      p_joining_date: "2024-01-15",
      p_employee_id: "EMP-1",
      p_vendor_name: "CleanCo",
      p_shift: "morning",
      p_emergency_contact_name: "Meena",
      p_emergency_contact_phone: "9822334456",
      p_id_proof_type: "aadhaar",
    });
    expect(res.error).toBeNull();
    staffId = res.data.id;
    expect(res.data.category).toBe("maintenance_staff");

    const directory = await owner.client.from("society_staff").select("*").eq("id", staffId);
    expect(directory.data[0].name).toBe("Sunil");
    expect(directory.data[0]).not.toHaveProperty("employee_id");
    expect(directory.data[0]).not.toHaveProperty("emergency_contact_phone");

    const hidden = await owner.client.from("society_staff_details").select("*");
    expect(hidden.error).not.toBeNull();
  });

  it.each([
    "security",
    "plumber",
    "electrician",
    "cleaner",
    "gardener",
    "maintenance_staff",
    "other",
  ])("accepts the %s staff role", async (category) => {
    const res = await a.authority.rpc("manager_save_staff", {
      p_society_id: a.id,
      p_name: `Staff ${category}`,
      p_category: category,
    });
    expect(res.data.category).toBe(category);
  });

  it("is restricted to managers of that society and grants no permissions", async () => {
    const args = { p_society_id: a.id, p_name: "Sneaky", p_category: "other" };
    for (const actor of [owner, b.authority, staff]) {
      expect(codeOf(await actor.rpc("manager_save_staff", args))).toBe("NOT_SOCIETY_MANAGER");
      expect(codeOf(await actor.rpc("manager_list_staff", { p_society_id: a.id }))).toBe(
        "NOT_SOCIETY_MANAGER",
      );
      expect(codeOf(await actor.rpc("manager_get_staff", { p_staff_id: staffId }))).toBe(
        "STAFF_NOT_FOUND",
      );
    }
    expect(
      codeOf(await a.authority.rpc("manager_save_staff", { ...args, p_category: "butler" })),
    ).toBe("INVALID_CATEGORY");
    expect(
      codeOf(await a.authority.rpc("manager_save_staff", { ...args, p_employee_id: "emp-1" })),
    ).toBe("EMPLOYEE_ID_TAKEN");

    const list = await a.authority.rpc("manager_list_staff", {
      p_society_id: a.id,
      p_search: "CleanCo",
    });
    expect(list.data.total).toBe(1);
    expect(list.data.items[0].last_name).toBe("Kale");

    const { data: row } = await adminClient()
      .from("society_staff")
      .select("*")
      .eq("id", staffId)
      .single();
    expect(Object.keys(row)).not.toContain("role");
  });

  it("an edit cannot reach a staff record in another society", async () => {
    expect(
      codeOf(
        await b.authority.rpc("manager_save_staff", {
          p_society_id: b.id,
          p_name: "Moved",
          p_category: "other",
          p_staff_id: staffId,
        }),
      ),
    ).toBe("STAFF_NOT_FOUND");
  });
});
