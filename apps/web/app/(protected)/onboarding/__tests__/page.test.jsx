// Routing rules of the /onboarding server page: who goes to the wizard, and who is
// sent to confirm imported details or to wait on a request instead.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, getUser, rpc, tables } = vi.hoisted(() => ({
  redirect: vi.fn((url) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  getUser: vi.fn(),
  rpc: vi.fn(),
  tables: {},
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/onboarding/OnboardingWizard", () => ({ OnboardingWizard: () => null }));

// supabase.from(table) returns an awaitable chain that resolves to tables[table].
function chain(result) {
  const promise = Promise.resolve(result);
  const self = Object.assign(promise, {
    select: () => self,
    eq: () => self,
    is: () => self,
    limit: () => self,
    maybeSingle: () => promise,
  });
  return self;
}
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser },
    rpc,
    from: (table) => chain(tables[table] ?? { data: null }),
  }),
}));

import OnboardingPage from "../page";

const USER = { id: "u1", phone: "919876543210", user_metadata: {} };

function onboardingState(overrides = {}) {
  return {
    data: {
      authority_societies: [],
      resident_records: [],
      tenant_registrations: [],
      household_requests: [],
      ...overrides,
    },
    error: null,
  };
}

async function run(searchParams = {}) {
  try {
    return { element: await OnboardingPage({ searchParams: Promise.resolve(searchParams) }) };
  } catch (err) {
    const match = String(err.message).match(/^REDIRECT:(.*)$/);
    if (match) return { redirect: match[1] };
    throw err;
  }
}

beforeEach(() => {
  redirect.mockClear();
  getUser.mockReset().mockResolvedValue({ data: { user: USER } });
  rpc.mockReset().mockResolvedValue(onboardingState());
  for (const k of Object.keys(tables)) delete tables[k];
  tables.society_memberships = { data: [] };
  tables.profiles = { data: { full_name: "Asha", pin_set: false } };
});

describe("/onboarding page", () => {
  it("sends a signed-out visitor to login", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await run()).toEqual({ redirect: "/login" });
  });

  it("sends an existing resident to the dashboard", async () => {
    tables.society_memberships = {
      data: [{ id: "m1", society_id: "s1", flat_id: "f1", status: "active" }],
    };
    expect(await run()).toEqual({ redirect: "/dashboard" });
  });

  it("sends someone with imported details to confirm them", async () => {
    rpc.mockResolvedValue(onboardingState({ resident_records: [{ id: "r1", status: "pending" }] }));
    expect(await run()).toEqual({ redirect: "/verification" });
    expect(rpc).toHaveBeenCalledWith("my_onboarding_state");
  });

  it("sends someone with a request in progress to the status page", async () => {
    rpc.mockResolvedValue(
      onboardingState({ household_requests: [{ id: "h1", status: "pending" }] }),
    );
    expect(await run()).toEqual({ redirect: "/onboarding/status" });
    rpc.mockResolvedValue(
      onboardingState({ tenant_registrations: [{ id: "t1", status: "owner_approved" }] }),
    );
    expect(await run()).toEqual({ redirect: "/onboarding/status" });
  });

  it("shows the wizard when asked to join manually, or when the state cannot load", async () => {
    rpc.mockResolvedValue(onboardingState({ resident_records: [{ id: "r1", status: "pending" }] }));
    const manual = await run({ manual: "1", code: "abcd-1234" });
    expect(manual.element.props).toMatchObject({
      initialName: "Asha",
      initialCode: "ABCD-1234",
      authorityMode: false,
    });

    rpc.mockRejectedValue(new Error("offline"));
    expect((await run()).element).toBeTruthy();
  });

  it("pre-fills the society code for a flat-less authority and keeps their PIN", async () => {
    tables.society_memberships = {
      data: [{ id: "m1", society_id: "s1", flat_id: null, status: "active" }],
    };
    tables.flats = { count: 12, data: null };
    tables.society_codes = { data: { code: "WXYZ-9876" } };
    tables.profiles = { data: { full_name: "Asha", pin_set: true } };
    const { element } = await run();
    expect(element.props).toMatchObject({
      initialCode: "WXYZ-9876",
      pinAlreadySet: true,
      authorityMode: true,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
