import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: vi.fn(() => ({})) }));
vi.mock("@parisar/api-client", () => ({ getConnectRequestStatus: vi.fn() }));

import { getConnectRequestStatus } from "@parisar/api-client";
import { ConnectSuccess } from "../ConnectSuccess";
import { saveLastRequest } from "../lib/connectStorage";
import { StatusLookupForm } from "../StatusLookupForm";

const SCHEDULED = {
  request_code: "PR-8K9M-6K43",
  status: "call_scheduled",
  call_now: false,
  preferred_at: "2026-11-08T11:00:00Z",
  preferred_slot: "Sun, 08 Nov 2026, 04:30 PM",
  alternate_at: "2026-11-09T05:30:00Z",
  scheduled_at: "2026-11-08T11:00:00Z",
  created_at: "2026-11-07T05:00:00Z",
};

describe("ConnectSuccess", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(getConnectRequestStatus).mockReset();
  });

  it("shows the confirmed request ID, status and scheduled time", async () => {
    saveLastRequest(SCHEDULED, "Green Meadows CHS");
    render(<ConnectSuccess code="PR-8K9M-6K43" />);
    expect(await screen.findByRole("heading", { name: "Request received" })).toBeInTheDocument();
    expect(screen.getByTestId("request-code")).toHaveTextContent("PR-8K9M-6K43");
    expect(screen.getByText("Green Meadows CHS")).toBeInTheDocument();
    expect(screen.getByText("Call scheduled")).toBeInTheDocument();
    expect(screen.getAllByText(/4:30.*IST/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Alternative time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy request ID" })).toBeInTheDocument();
  });

  it("says call as soon as possible for a call-now request", async () => {
    saveLastRequest(
      {
        ...SCHEDULED,
        status: "new",
        call_now: true,
        preferred_at: null,
        scheduled_at: null,
        alternate_at: null,
      },
      "Green Meadows CHS",
    );
    render(<ConnectSuccess code="PR-8K9M-6K43" />);
    expect(await screen.findByText("As soon as possible")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("offers the lookup when nothing was stored for that code", async () => {
    saveLastRequest({ ...SCHEDULED, request_code: "PR-AAAA-BBBB" }, "Other");
    render(<ConnectSuccess code="PR-8K9M-6K43" />);
    expect(await screen.findByRole("heading", { name: "Check your request" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Request ID/)).toHaveValue("PR-8K9M-6K43");
    expect(screen.queryByText("Request received")).not.toBeInTheDocument();
  });

  it("never shows a stored request as just received without its code in the URL", async () => {
    saveLastRequest(SCHEDULED, "Green Meadows CHS");
    render(<ConnectSuccess code="" />);
    expect(await screen.findByRole("heading", { name: "Check your request" })).toBeInTheDocument();
    expect(screen.queryByText("Request received")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Request ID/)).toHaveValue("");
  });

  it("looks a request up and shows its current status", async () => {
    vi.mocked(getConnectRequestStatus).mockResolvedValue({ ...SCHEDULED, status: "contacted" });
    render(<ConnectSuccess code="" />);
    fireEvent.change(await screen.findByLabelText(/Request ID/), {
      target: { value: "pr-8k9m-6k43" },
    });
    fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    expect(await screen.findByRole("heading", { name: "Your request" })).toBeInTheDocument();
    expect(screen.getByText("Contacted")).toBeInTheDocument();
    expect(getConnectRequestStatus).toHaveBeenCalledWith(expect.anything(), {
      requestCode: "PR-8K9M-6K43",
      phone: "+919876543210",
    });
  });

  it("switches from the confirmation to the lookup", async () => {
    saveLastRequest(SCHEDULED, "Green Meadows CHS");
    render(<ConnectSuccess code="PR-8K9M-6K43" />);
    fireEvent.click(await screen.findByRole("button", { name: "Check the latest status" }));
    expect(screen.getByLabelText(/Request ID/)).toHaveValue("PR-8K9M-6K43");
  });
});

describe("StatusLookupForm", () => {
  it("validates both fields before calling", async () => {
    const lookup = vi.fn();
    render(<StatusLookupForm onFound={vi.fn()} lookup={lookup} />);
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    expect(
      await screen.findByText("Enter the request ID in the form PR-XXXX-XXXX."),
    ).toBeInTheDocument();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("gives one message for a wrong pair and a missing code", async () => {
    const lookup = vi.fn().mockResolvedValue({ error: "REQUEST_NOT_FOUND" });
    render(<StatusLookupForm initialCode="PR-8K9M-6K43" onFound={vi.fn()} lookup={lookup} />);
    fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    expect(
      await screen.findByText(/couldn't find a request with that ID and mobile number/),
    ).toBeInTheDocument();
  });

  it("explains the lookup rate limit and generic failures", async () => {
    const lookup = vi
      .fn()
      .mockResolvedValueOnce({ error: "RATE_LIMITED" })
      .mockRejectedValueOnce(new Error("network"));
    render(<StatusLookupForm initialCode="PR-8K9M-6K43" onFound={vi.fn()} lookup={lookup} />);
    fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    expect(await screen.findByText(/Too many checks/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    await waitFor(() =>
      expect(screen.getByText(/couldn't check your request/)).toBeInTheDocument(),
    );
  });
});
