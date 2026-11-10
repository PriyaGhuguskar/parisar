import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("@parisar/api-client", () => ({
  submitConnectRequest: vi.fn(),
  getConnectRequestStatus: vi.fn(),
}));

import { ConnectForm } from "../ConnectForm";

function fillBasics() {
  fireEvent.change(screen.getByLabelText(/Society name/), {
    target: { value: "Green Meadows CHS" },
  });
  fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Asha Patil" } });
  fireEvent.change(screen.getByLabelText(/Your mobile number/), {
    target: { value: "9876543210" },
  });
  fireEvent.click(screen.getByLabelText("As soon as possible"));
}

const OK = {
  request_code: "PR-8K9M-6K43",
  status: "new",
  call_now: true,
  preferred_at: null,
  preferred_slot: "Call me now",
  alternate_at: null,
  scheduled_at: null,
  created_at: "2026-11-07T05:00:00Z",
};

describe("ConnectForm", () => {
  beforeEach(() => {
    push.mockReset();
    window.sessionStorage.clear();
  });

  it("marks the required fields and shows the schedule by default", () => {
    render(<ConnectForm submit={vi.fn()} />);
    expect(screen.getByLabelText(/Society name/)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(/Your name/)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(/Your mobile number/)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(/^Email/)).not.toHaveAttribute("aria-required");
    expect(screen.getByText("Preferred date and time")).toBeInTheDocument();
    expect(screen.getByText("Alternative date and time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send request" })).toBeEnabled();
  });

  it("shows field errors and does not submit when empty", async () => {
    const submit = vi.fn();
    render(<ConnectForm submit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(
      await screen.findByText("Enter your society's name (2 to 120 characters)."),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter your name (2 to 80 characters).")).toBeInTheDocument();
    expect(screen.getByText("Choose a date.")).toBeInTheDocument();
    expect(screen.getByText("Choose a time.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Society name/)).toHaveAttribute("aria-invalid", "true");
    expect(submit).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText(/Society name/)).toHaveFocus());
  });

  it("adds and removes authority numbers and rejects a duplicate", async () => {
    const submit = vi.fn();
    render(<ConnectForm submit={submit} />);
    fillBasics();
    fireEvent.click(screen.getByRole("button", { name: "Add another number" }));
    const row = screen.getByRole("group", { name: "Authority 2" });
    fireEvent.change(within(row).getByLabelText(/Mobile number/), {
      target: { value: "9876543210" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("This number is already on the list.")).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove authority 2" }));
    expect(screen.queryByRole("group", { name: "Authority 2" })).not.toBeInTheDocument();
  });

  it("hides the add button once five extra numbers are listed", () => {
    render(<ConnectForm submit={vi.fn()} />);
    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Add another number" }));
    }
    expect(screen.queryByRole("button", { name: "Add another number" })).not.toBeInTheDocument();
    expect(screen.getByText(/You can add up to 5 more numbers/)).toBeInTheDocument();
  });

  it("submits, stores the server's result and moves to the success page", async () => {
    const submit = vi.fn().mockResolvedValue(OK);
    render(<ConnectForm submit={submit} />);
    fillBasics();
    fireEvent.click(screen.getByRole("button", { name: "Add another number" }));
    const row = screen.getByRole("group", { name: "Authority 2" });
    fireEvent.change(within(row).getByLabelText(/Mobile number/), {
      target: { value: "9123456789" },
    });
    fireEvent.change(within(row).getByLabelText(/^Name/), { target: { value: "Ravi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/connect/success?code=PR-8K9M-6K43"));
    expect(submit.mock.calls[0][1]).toMatchObject({
      societyName: "Green Meadows CHS",
      contactName: "Asha Patil",
      phone: "+919876543210",
      callNow: true,
      authorityNumbers: [{ phone: "+919123456789", name: "Ravi" }],
    });
    const stored = JSON.parse(window.sessionStorage.getItem("parisar.connect.lastRequest"));
    expect(stored.request_code).toBe("PR-8K9M-6K43");
    expect(stored.society_name).toBe("Green Meadows CHS");
    expect(JSON.stringify(stored)).not.toContain("9876543210");
  });

  it("says we already have the request on a duplicate open request", async () => {
    render(<ConnectForm submit={vi.fn().mockResolvedValue({ error: "REQUEST_ALREADY_OPEN" })} />);
    fillBasics();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("We already have your request")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check your request" })).toHaveAttribute(
      "href",
      "/connect/success",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("explains a rate limit and keeps what was typed", async () => {
    render(<ConnectForm submit={vi.fn().mockResolvedValue({ error: "RATE_LIMITED" })} />);
    fillBasics();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
    expect(screen.getByLabelText(/Society name/)).toHaveValue("Green Meadows CHS");
    expect(screen.getByRole("button", { name: "Send request" })).toBeEnabled();
  });

  it("shows a generic failure when the call throws", async () => {
    render(<ConnectForm submit={vi.fn().mockRejectedValue(new Error("offline"))} />);
    fillBasics();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Your request wasn't sent")).toBeInTheDocument();
    expect(screen.queryByText("offline")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("puts a server field error on its field", async () => {
    render(<ConnectForm submit={vi.fn().mockResolvedValue({ error: "INVALID_EMAIL" })} />);
    fillBasics();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(
      await screen.findByText("Enter a valid email address, or leave it blank."),
    ).toBeInTheDocument();
  });

  it("shows a busy state while sending", async () => {
    let resolve;
    const submit = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    render(<ConnectForm submit={submit} />);
    fillBasics();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("button", { name: /Sending/ })).toBeDisabled();
    resolve({ error: "RATE_LIMITED" });
    expect(await screen.findByRole("button", { name: "Send request" })).toBeEnabled();
  });
});
