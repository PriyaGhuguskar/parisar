import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: vi.fn(() => ({})) }));
vi.mock("@/components/society/AmenitiesSection", () => ({
  AmenitiesSection: () => <div data-testid="amenities-section" />,
}));
vi.mock("@parisar/api-client", () => ({
  setupGetState: vi.fn(),
  getSocietyRegistration: vi.fn(),
  setupCompleteStep: vi.fn(),
  setupSkipStep: vi.fn(),
  setupComplete: vi.fn(),
  setupSaveDraft: vi.fn(),
  setupUpsertWing: vi.fn(),
  setupDeleteWing: vi.fn(),
  setupUpsertFloor: vi.fn(),
  setupDeleteFloor: vi.fn(),
  setupUpsertFlat: vi.fn(),
  setupDeleteFlat: vi.fn(),
  setupBulkCreateFlats: vi.fn(),
  myAuthoritySocieties: vi.fn(),
  authoritySkipPersonalOnboarding: vi.fn(),
}));

import * as api from "@parisar/api-client";
import { SetupWizard } from "../SetupWizard";

const KEYS = [
  "society_details",
  "authorities",
  "wings",
  "floors",
  "flats",
  "amenities",
  "staff",
  "guards",
  "residents_import",
];

function makeState({ done = [], wings = [], completedAt = null } = {}) {
  return {
    society: {
      id: "s1",
      name: "Green Meadows",
      code: "GRMD-AB12",
      setup_completed_at: completedAt,
    },
    counts: {
      wings: wings.length,
      floors: wings.reduce((n, w) => n + (w.floors?.length ?? 0), 0),
      flats: 0,
    },
    can_complete: false,
    steps: KEYS.map((key) => ({
      key,
      required: ["wings", "floors", "flats"].includes(key),
      status: done.includes(key) ? "completed" : "pending",
      draft: null,
    })),
    wings,
  };
}

const REG = {
  name: "Green Meadows",
  code: "GRMD-AB12",
  registration_number: "MH/123/2020",
  society_type: "cooperative_housing",
  registration_date: "2020-01-15",
  city: "Pune",
  state: "Maharashtra",
  setup_completed_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  api.getSocietyRegistration.mockResolvedValue(REG);
});

describe("SetupWizard", () => {
  it("shows a loading state, then prefilled society details on a fresh society", async () => {
    api.setupGetState.mockResolvedValue(makeState());
    render(<SetupWizard societyId="s1" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("MH/123/2020")).toBeInTheDocument();
    expect(screen.getByText("Co-operative housing society")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Details are correct, continue" })).toBeEnabled();
  });

  it("shows an error state with retry when progress cannot load", async () => {
    api.setupGetState.mockResolvedValueOnce({ error: "UNKNOWN" });
    api.setupGetState.mockResolvedValueOnce(makeState());
    render(<SetupWizard societyId="s1" />);
    expect(await screen.findByText("Setup couldn't load")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(await screen.findByText("MH/123/2020")).toBeInTheDocument();
  });

  it("does not offer retry when the caller is not a manager", async () => {
    api.setupGetState.mockResolvedValue({ error: "NOT_SOCIETY_MANAGER" });
    render(<SetupWizard societyId="s1" />);
    expect(
      await screen.findByText("Only the society's authorities can do this."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again|retry/i })).toBeNull();
  });

  it("resumes on the first unfinished step", async () => {
    api.setupGetState.mockResolvedValue(
      makeState({
        done: ["society_details"],
        wings: [{ id: "w1", name: "A Wing", code: "A", floors: [], unassigned_flats: [] }],
      }),
    );
    render(<SetupWizard societyId="s1" />);
    expect(await screen.findByText("Add more wings")).toBeInTheDocument();
    expect(screen.getByText(/Saved wings/)).toBeInTheDocument();
  });

  it("validates wing rows and marks required fields", async () => {
    api.setupGetState.mockResolvedValue(makeState({ done: ["society_details"] }));
    render(<SetupWizard societyId="s1" />);
    const name = await screen.findByLabelText(/Wing name/);
    expect(name).toHaveAttribute("aria-required", "true");
    fireEvent.change(name, { target: { value: "A Wing" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("Enter the number of floors.")).toBeInTheDocument();
    expect(api.setupUpsertWing).not.toHaveBeenCalled();
  });

  it("creates a wing with its floors, then completes the step", async () => {
    const empty = makeState({ done: ["society_details"] });
    const withWing = makeState({
      done: ["society_details", "wings"],
      wings: [
        {
          id: "w1",
          name: "A Wing",
          code: "A",
          floors: [
            { id: "f1", number: 1, name: null, flat_count: 0, flats: [] },
            { id: "f2", number: 2, name: null, flat_count: 0, flats: [] },
          ],
          unassigned_flats: [],
        },
      ],
    });
    api.setupGetState.mockResolvedValueOnce(empty).mockResolvedValue(withWing);
    api.setupUpsertWing.mockResolvedValue({ id: "w1", name: "A Wing", code: "A" });
    api.setupUpsertFloor.mockResolvedValue({ id: "f" });
    api.setupCompleteStep.mockResolvedValue({ step: "wings", status: "completed" });

    render(<SetupWizard societyId="s1" />);
    fireEvent.change(await screen.findByLabelText(/Wing name/), { target: { value: "A Wing" } });
    fireEvent.change(screen.getByLabelText(/Wing code/), { target: { value: "a" } });
    fireEvent.change(screen.getByLabelText(/Number of floors/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));

    await waitFor(() => expect(api.setupCompleteStep).toHaveBeenCalled());
    expect(api.setupUpsertWing).toHaveBeenCalledWith(expect.anything(), {
      societyId: "s1",
      name: "A Wing",
      code: "A",
    });
    expect(api.setupUpsertFloor).toHaveBeenCalledTimes(2);
    expect(api.setupCompleteStep).toHaveBeenCalledWith(expect.anything(), {
      societyId: "s1",
      step: "wings",
    });
    expect(
      await screen.findByText(
        "Check each wing's floors. Floor 0 is the ground floor; negative numbers are basements.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the server's duplicate error next to the wing name", async () => {
    api.setupGetState.mockResolvedValue(makeState({ done: ["society_details"] }));
    api.setupUpsertWing.mockResolvedValue({ error: "WING_NAME_EXISTS" });
    render(<SetupWizard societyId="s1" />);
    fireEvent.change(await screen.findByLabelText(/Wing name/), { target: { value: "A Wing" } });
    fireEvent.change(screen.getByLabelText(/Number of floors/), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(
      (await screen.findAllByText("There is already a wing with this name.")).length,
    ).toBeGreaterThan(0);
    expect(api.setupCompleteStep).not.toHaveBeenCalled();
  });

  it("saves a draft of unsaved wing rows", async () => {
    api.setupGetState.mockResolvedValue(makeState({ done: ["society_details"] }));
    api.setupSaveDraft.mockResolvedValue({ step: "wings", status: "draft" });
    render(<SetupWizard societyId="s1" />);
    fireEvent.change(await screen.findByLabelText(/Wing name/), { target: { value: "B Wing" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      await screen.findByText("Draft saved. You can come back to it any time."),
    ).toBeInTheDocument();
    expect(api.setupSaveDraft).toHaveBeenCalledWith(expect.anything(), {
      societyId: "s1",
      step: "wings",
      draft: { rows: [expect.objectContaining({ name: "B Wing" })] },
    });
  });

  it("shows the finished screen when the society is already set up", async () => {
    api.setupGetState.mockResolvedValue(makeState({ completedAt: "2026-11-01T00:00:00Z" }));
    api.myAuthoritySocieties.mockResolvedValue({
      societies: [{ society_id: "s1", setup_state: "complete", claimed: true }],
    });
    render(<SetupWizard societyId="s1" />);
    expect(
      await screen.findByText(
        "This society is already set up. You can review the structure or carry on.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Go to Society Dashboard" })).toHaveAttribute(
      "href",
      "/society-dashboard",
    );
  });
});
