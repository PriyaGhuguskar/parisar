/**
 * code-card-03-09.test.jsx
 * CodeCard component tests — Plan 03-09
 *
 * Separated from dashboard-03-09.test.jsx so CodeCard can be imported
 * without the global mock that DashboardClient tests require.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@parisar/api-client", () => ({
  resumeSocietyCode: vi.fn().mockResolvedValue({ resumed: true }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: vi.fn(() => ({})),
}));

// ---------------------------------------------------------------------------
// Tests: CodeCard (real implementation, not mocked)
// ---------------------------------------------------------------------------
import { CodeCard } from "../../components/dashboard/CodeCard";

describe("CodeCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Provide clipboard API stub
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("renders society code in active state", () => {
    render(<CodeCard code="PAR7-XKM2" societyId="soc-123" paused={false} />);
    expect(screen.getByText("PAR7-XKM2")).toBeTruthy();
  });

  it("renders Copy button in active state", () => {
    render(<CodeCard code="PAR7-XKM2" societyId="soc-123" paused={false} />);
    expect(screen.getByLabelText("Copy society code")).toBeTruthy();
  });

  it("renders Share button as an anchor with wa.me href (not window.open)", () => {
    render(<CodeCard code="PAR7-XKM2" societyId="soc-123" paused={false} />);
    const shareLink = screen.getByLabelText("Share society code via WhatsApp");
    expect(shareLink.tagName.toLowerCase()).toBe("a");
    expect(shareLink.getAttribute("href")).toContain("wa.me");
  });

  it("renders Rotate Code link pointing to /dashboard/code-rotation", () => {
    render(<CodeCard code="PAR7-XKM2" societyId="soc-123" paused={false} />);
    const rotateLink = screen.getByRole("link", { name: /rotate/i });
    expect(rotateLink.getAttribute("href")).toBe("/dashboard/code-rotation");
  });

  it("does NOT invoke window.open when share anchor is clicked", () => {
    const winOpenSpy = vi.spyOn(window, "open");
    render(<CodeCard code="PAR7-XKM2" societyId="soc-123" paused={false} />);
    const shareLink = screen.getByLabelText("Share society code via WhatsApp");
    fireEvent.click(shareLink);
    expect(winOpenSpy).not.toHaveBeenCalled();
    winOpenSpy.mockRestore();
  });

  it("shows dash fallback when code is null", () => {
    render(<CodeCard code={null} societyId="soc-123" paused={false} />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("shows paused alert text in paused state", () => {
    render(<CodeCard code="PAR7-XKM2" societyId="soc-123" paused={true} />);
    expect(screen.getByText(/code is paused/i)).toBeTruthy();
  });

  it("shows Resume Code button in paused state", () => {
    render(<CodeCard code="PAR7-XKM2" societyId="soc-123" paused={true} />);
    expect(screen.getByRole("button", { name: /resume/i })).toBeTruthy();
  });

  it("calls resumeSocietyCode and onResume on resume button click", async () => {
    const { resumeSocietyCode } = await import("@parisar/api-client");
    const onResume = vi.fn();
    render(<CodeCard code="PAR7-XKM2" societyId="soc-123" paused={true} onResume={onResume} />);
    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    await waitFor(() => expect(resumeSocietyCode).toHaveBeenCalled());
    await waitFor(() => expect(onResume).toHaveBeenCalled());
  });

  it("copies code to clipboard when Copy is clicked", async () => {
    render(<CodeCard code="PAR7-XKM2" societyId="soc-123" paused={false} />);
    fireEvent.click(screen.getByLabelText("Copy society code"));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("PAR7-XKM2"));
  });
});
