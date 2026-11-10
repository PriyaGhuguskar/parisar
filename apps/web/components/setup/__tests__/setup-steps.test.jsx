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
const countQuery = { count: 0, error: null };
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: vi.fn(() => ({
    from: () => ({ select: () => ({ eq: () => Promise.resolve(countQuery) }) }),
  })),
}));
vi.mock("@/components/society/AmenitiesSection", () => ({
  AmenitiesSection: () => <div data-testid="amenities-section" />,
}));
vi.mock("@parisar/api-client", () => ({
  setupCompleteStep: vi.fn(),
  setupSkipStep: vi.fn(),
  setupComplete: vi.fn(),
  setupSaveDraft: vi.fn(),
  setupUpsertFloor: vi.fn(),
  setupDeleteFloor: vi.fn(),
  setupUpsertFlat: vi.fn(),
  setupDeleteFlat: vi.fn(),
  setupBulkCreateFlats: vi.fn(),
  authoritySkipPersonalOnboarding: vi.fn(),
}));

import * as api from "@parisar/api-client";
import { PersonalChoice } from "../PersonalChoice";
import { FlatsStep } from "../steps/FlatsStep";
import { FloorsStep } from "../steps/FloorsStep";
import { OptionalStep } from "../steps/OptionalStep";

const errorText = (code) => `error:${code}`;

const wing = (floors) => ({ id: "w1", name: "A Wing", code: "A", floors, unassigned_flats: [] });
const state = (wings, steps = []) => ({
  society: { id: "s1", name: "Green Meadows" },
  counts: { wings: wings.length, floors: 1, flats: 0 },
  steps,
  wings,
});

let reload;
beforeEach(() => {
  vi.clearAllMocks();
  reload = vi.fn().mockResolvedValue(null);
});

describe("FloorsStep", () => {
  it("shows an empty state that leads back to wings when there are none", () => {
    const onBack = vi.fn();
    render(
      <FloorsStep
        societyId="s1"
        state={state([])}
        reload={reload}
        errorText={errorText}
        onBack={onBack}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText("Add a wing first")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to wings" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("rejects a duplicate floor number before calling the server", async () => {
    const floors = [{ id: "f1", number: 1, name: null, flat_count: 4, flats: [] }];
    render(
      <FloorsStep
        societyId="s1"
        state={state([wing(floors)])}
        reload={reload}
        errorText={errorText}
        onNext={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add floor" }));
    const numbers = screen.getAllByLabelText(/Floor number/);
    fireEvent.change(numbers[1], { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("This wing already has this floor number.")).toBeInTheDocument();
    expect(api.setupUpsertFloor).not.toHaveBeenCalled();
  });

  it("applies the 'flats on each floor' count and saves changed floors", async () => {
    const floors = [
      { id: "f1", number: 1, name: null, flat_count: 0, flats: [] },
      { id: "f2", number: 2, name: null, flat_count: 0, flats: [] },
    ];
    api.setupUpsertFloor.mockResolvedValue({ id: "f" });
    api.setupCompleteStep.mockResolvedValue({ step: "floors", status: "completed" });
    const onNext = vi.fn();
    render(
      <FloorsStep
        societyId="s1"
        state={state([wing(floors)])}
        reload={reload}
        errorText={errorText}
        onNext={onNext}
      />,
    );
    fireEvent.change(screen.getByLabelText("Flats on each floor"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply to all floors" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(onNext).toHaveBeenCalled());
    expect(api.setupUpsertFloor).toHaveBeenCalledTimes(2);
    expect(api.setupUpsertFloor).toHaveBeenCalledWith(expect.anything(), {
      societyId: "s1",
      wingId: "w1",
      number: 1,
      name: null,
      flatCount: 4,
      floorId: "f1",
    });
  });

  it("shows the server error and stays on the step", async () => {
    const floors = [{ id: "f1", number: 1, name: null, flat_count: 0, flats: [] }];
    api.setupUpsertFloor.mockResolvedValue({ error: "SOCIETY_SERVICE_STOPPED" });
    const onNext = vi.fn();
    render(
      <FloorsStep
        societyId="s1"
        state={state([wing(floors)])}
        reload={reload}
        errorText={errorText}
        onNext={onNext}
      />,
    );
    fireEvent.change(screen.getAllByLabelText(/Flats planned/)[0], { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("error:SOCIETY_SERVICE_STOPPED")).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe("FlatsStep", () => {
  const floors = [{ id: "f1", number: 1, name: null, flat_count: 2, flats: [] }];

  it("plans flats from the floor's planned count and creates them in one bulk call", async () => {
    api.setupBulkCreateFlats.mockResolvedValue({ created: 2, flats: [] });
    render(
      <FlatsStep
        societyId="s1"
        state={state([wing(floors)])}
        reload={reload}
        errorText={errorText}
        onNext={vi.fn()}
      />,
    );
    const create = screen.getByRole("button", { name: "Create 2 flats" });
    fireEvent.click(create);
    expect(await screen.findByText(/Flats created: 2/)).toBeInTheDocument();
    expect(api.setupBulkCreateFlats).toHaveBeenCalledWith(expect.anything(), {
      societyId: "s1",
      floorId: "f1",
      flats: [
        expect.objectContaining({ number: "101", status: "vacant" }),
        expect.objectContaining({ number: "102", status: "vacant" }),
      ],
    });
  });

  it("refuses to continue when the server has no flat yet", async () => {
    api.setupCompleteStep.mockResolvedValue({ error: "STEP_INCOMPLETE" });
    const onNext = vi.fn();
    render(
      <FlatsStep
        societyId="s1"
        state={state([wing(floors)])}
        reload={reload}
        errorText={errorText}
        onNext={onNext}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("Create at least one flat to continue.")).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("opens a flat's details from its chip", async () => {
    const withFlat = [
      {
        ...floors[0],
        flats: [
          {
            id: "x1",
            number: "101",
            status: "vacant",
            effective_status: "vacant",
            flat_type: "2bhk",
          },
        ],
      },
    ];
    render(
      <FlatsStep
        societyId="s1"
        state={state([wing(withFlat)])}
        reload={reload}
        errorText={errorText}
        onNext={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Flat 101, Vacant. Edit" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/Flat number/)).toHaveValue("101");
  });
});

describe("OptionalStep", () => {
  it("lists only real optional areas and completes setup", async () => {
    api.setupSkipStep.mockResolvedValue({ status: "skipped" });
    api.setupComplete.mockResolvedValue({
      setup_state: "complete",
      counts: { wings: 1, floors: 1, flats: 2 },
    });
    const onCompleted = vi.fn();
    render(
      <OptionalStep
        societyId="s1"
        state={state([wing([])])}
        reload={reload}
        errorText={errorText}
        onCompleted={onCompleted}
      />,
    );
    expect(screen.getByTestId("amenities-section")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Import residents/ })).toHaveAttribute(
      "href",
      "/import",
    );
    expect(screen.queryByText(/parking|accounting|vendor|event/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Complete setup" }));
    await waitFor(() => expect(onCompleted).toHaveBeenCalled());
    expect(api.setupSkipStep).toHaveBeenCalledWith(expect.anything(), {
      societyId: "s1",
      step: "amenities",
    });
    expect(api.setupComplete).toHaveBeenCalledWith(expect.anything(), "s1");
  });

  it("shows why setup cannot be completed", async () => {
    api.setupSkipStep.mockResolvedValue({ status: "skipped" });
    api.setupComplete.mockResolvedValue({ error: "SETUP_NEEDS_FLAT" });
    const onCompleted = vi.fn();
    render(
      <OptionalStep
        societyId="s1"
        state={state([wing([])])}
        reload={reload}
        errorText={errorText}
        onCompleted={onCompleted}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Complete setup" }));
    expect(await screen.findByText("error:SETUP_NEEDS_FLAT")).toBeInTheDocument();
    expect(onCompleted).not.toHaveBeenCalled();
  });
});

describe("PersonalChoice", () => {
  it("records 'only manage' on the server, then opens the Society Dashboard", async () => {
    api.authoritySkipPersonalOnboarding.mockResolvedValue({ setup_state: "complete" });
    render(<PersonalChoice societyId="s1" />);
    expect(screen.getByRole("link", { name: "Choose my flat" })).toHaveAttribute(
      "href",
      "/onboarding",
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue without a flat" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/society-dashboard"));
  });

  it("keeps the person on the page when the skip is refused", async () => {
    api.authoritySkipPersonalOnboarding.mockResolvedValue({ error: "NOT_AN_AUTHORITY" });
    render(<PersonalChoice societyId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: "Continue without a flat" }));
    expect(
      await screen.findByText("Your number isn't on this society's authority list."),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
