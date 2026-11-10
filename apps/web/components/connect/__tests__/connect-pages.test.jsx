import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: (url) => redirect(url),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  // biome-ignore lint/performance/noImgElement: test stub for next/image
  default: ({ priority: _priority, ...props }) => <img {...props} alt={props.alt ?? ""} />,
}));
vi.mock("@/app/actions/set-language", () => ({ setLanguageAction: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: vi.fn(() => ({})) }));
vi.mock("@parisar/api-client", () => ({
  submitConnectRequest: vi.fn(),
  getConnectRequestStatus: vi.fn(),
}));

import ConnectPage from "@/app/connect/page";
import ConnectSuccessPage from "@/app/connect/success/page";
import Enroll from "@/app/enroll/page";

describe("connect routes", () => {
  it("/connect renders the header, intro and form", () => {
    render(<ConnectPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Connect with us" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to home/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Send request" })).toBeInTheDocument();
  });

  it("/connect/success reads the code from the query", async () => {
    render(await ConnectSuccessPage({ searchParams: Promise.resolve({ code: "PR-8K9M-6K43" }) }));
    expect(await screen.findByLabelText(/Request ID/)).toHaveValue("PR-8K9M-6K43");
  });

  it("/enroll redirects to /connect and keeps the query", async () => {
    await Enroll({ searchParams: Promise.resolve({ ref: "pricing" }) });
    expect(redirect).toHaveBeenCalledWith("/connect?ref=pricing");
    await Enroll({ searchParams: Promise.resolve({}) });
    expect(redirect).toHaveBeenLastCalledWith("/connect");
  });
});
