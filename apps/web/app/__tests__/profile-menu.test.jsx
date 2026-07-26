import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Models @base-ui/react's `render` contract (this project's shadcn layer is
// base-ui, not Radix): the caller passes the element to render AS the item, and
// `children` go inside it. The old mock assumed Radix's `asChild`.
// NOTE: vi.mock factories are hoisted above imports → import React inside.
vi.mock("@/components/ui/dropdown-menu", async () => {
  const { cloneElement } = await import("react");
  return {
    DropdownMenu: ({ children }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children, render: renderEl }) =>
      renderEl ? cloneElement(renderEl, {}, children) : <div>{children}</div>,
    DropdownMenuContent: ({ children }) => <div data-testid="dm-content">{children}</div>,
    DropdownMenuItem: ({ children, disabled, render: renderEl, ...rest }) =>
      renderEl ? (
        cloneElement(
          renderEl,
          { ...rest, "aria-disabled": disabled ? "true" : undefined },
          children,
        )
      ) : (
        <div {...rest} aria-disabled={disabled ? "true" : undefined}>
          {children}
        </div>
      ),
    DropdownMenuLabel: ({ children }) => <div data-testid="dm-label">{children}</div>,
    DropdownMenuSeparator: () => null,
  };
});

vi.mock("@/app/actions/auth", () => ({ signOutAction: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: () => ({}) }));
vi.mock("@/lib/flat-label", () => ({ fetchFlatLabel: vi.fn().mockResolvedValue("B-203") }));

// Phase 7 — Plan 07-04 (Rule 1 deviation): ProfileMenuDropdown now mounts
// LanguageSelector, which calls useRouter() + useTranslation() + the server
// action. The previous test file didn't mock those modules because they didn't
// exist in the transitive import chain. Adding the mocks restores green.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      // Return a sensible English string for the keys the menu uses; any other
      // key returns the key itself (matches i18next's missing-key fallback).
      const map = {
        "profile.language": "Language",
        "profile.roleTransfer": "Transfer Secretary role",
        "profile.notificationSettings": "Notification settings",
        "profile.signOut": "Sign out",
        "profile.signOutError": "Couldn't sign out. Please try again.",
        "language.title": "Choose language",
        "language.english": "English",
        "language.hindi": "हिन्दी",
        "language.marathi": "मराठी",
        "language.saveError": "Couldn't save language",
        "header.openProfile": "Open profile menu",
        "role.member": "Member",
        "role.board_member": "Board Member",
        "role.co_secretary": "Co-Secretary",
        "role.secretary": "Secretary",
        "moderation:grievance.menuRow": "Grievance Officer",
        "moderation:about.title": "About & Help",
      };
      if (map[key] !== undefined) return map[key];
      if (opts && typeof opts === "object" && typeof opts.defaultValue === "string")
        return opts.defaultValue;
      return key;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
  I18nextProvider: ({ children }) => <>{children}</>,
}));
vi.mock("@/app/actions/set-language", () => ({
  setLanguageAction: vi.fn(async () => ({ lng: "en" })),
}));

import { ProfileMenuDropdown } from "../../components/dashboard/ProfileMenuDropdown";

describe("ProfileMenuDropdown (web)", () => {
  it("renders Sign Out", () => {
    render(
      <ProfileMenuDropdown
        userId="u-1"
        societyId="s-1"
        role="member"
        fullName="Aman Khan"
        flatLabel="B-203"
      />,
    );
    expect(screen.getByText("Sign out")).toBeInTheDocument();
  });

  it("renders Role Transfer for secretary", () => {
    render(
      <ProfileMenuDropdown
        userId="u-1"
        societyId="s-1"
        role="secretary"
        fullName="X"
        flatLabel="A-1"
      />,
    );
    expect(screen.getByText("Transfer Secretary role")).toBeInTheDocument();
  });

  it("renders Role Transfer for co_secretary", () => {
    render(
      <ProfileMenuDropdown
        userId="u-1"
        societyId="s-1"
        role="co_secretary"
        fullName="X"
        flatLabel="A-1"
      />,
    );
    expect(screen.getByText("Transfer Secretary role")).toBeInTheDocument();
  });

  it("does NOT render Role Transfer for member", () => {
    render(
      <ProfileMenuDropdown
        userId="u-1"
        societyId="s-1"
        role="member"
        fullName="X"
        flatLabel="A-1"
      />,
    );
    expect(screen.queryByText("Transfer Secretary role")).toBeNull();
  });

  it("does NOT render Role Transfer for board_member", () => {
    render(
      <ProfileMenuDropdown
        userId="u-1"
        societyId="s-1"
        role="board_member"
        fullName="X"
        flatLabel="A-1"
      />,
    );
    expect(screen.queryByText("Transfer Secretary role")).toBeNull();
  });

  it("activates Notification Settings → /settings/notifications (DT-02, no longer disabled)", () => {
    render(
      <ProfileMenuDropdown
        userId="u-1"
        societyId="s-1"
        role="member"
        fullName="X"
        flatLabel="A-1"
      />,
    );
    // Phase 5 DT-02 flip: the item is now a live navigation, not a disabled
    // placeholder. The "Ships in Phase 5" pill is gone and it links to the prefs.
    const link = screen.getByText("Notification settings").closest("a");
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("/settings/notifications");
  });

  it("user header shows fullName + flat · role", () => {
    render(
      <ProfileMenuDropdown
        userId="u-1"
        societyId="s-1"
        role="secretary"
        fullName="Aman Khan"
        flatLabel="B-203"
      />,
    );
    // Scope to the menu label — "Secretary" also appears in the "Transfer
    // Secretary role" item, so assert the role chip within the header label.
    const label = within(screen.getByTestId("dm-label"));
    expect(label.getByText("Aman Khan")).toBeInTheDocument();
    expect(label.getByText(/B-203/)).toBeInTheDocument();
    expect(label.getByText(/Secretary/)).toBeInTheDocument();
  });

  it("Sign Out is a form submit (POSTs to signOutAction)", () => {
    const { container } = render(
      <ProfileMenuDropdown
        userId="u-1"
        societyId="s-1"
        role="member"
        fullName="X"
        flatLabel="A-1"
      />,
    );
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
  });
});
