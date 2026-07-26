// apps/web/__tests__/language-selector.test.jsx
// Phase 7 — Plan 07-04 Task 2.
//
// Locks the LanguageSelector contract:
//   - Renders shadcn Dialog with the localized title
//   - Renders 3 rows (English / हिन्दी / मराठी), English selected by default
//   - Tapping Hindi calls setLanguageAction("hi") + router.refresh()
//   - UI-SPEC §Typography lines 249-253 — the row label <span> declares the
//     Devanagari font in its inline style (the literal `--font-noto-devanagari`
//     CSS-variable reference + the "Noto Sans Devanagari" fallback name).

import { createI18nInstance } from "@parisar/i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Mock the server action — vitest spies record the calls + return a happy path.
const setLanguageActionMock = vi.fn(async (lng) => ({ lng }));
vi.mock("@/app/actions/set-language", () => ({
  setLanguageAction: (lng) => setLanguageActionMock(lng),
}));

// Mock next/navigation — we only need useRouter().refresh().
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { LanguageSelector } from "../components/profile/LanguageSelector";

let i18n;

beforeAll(async () => {
  // Build a real i18next instance preloaded with the dashboard namespace in
  // all three locales — exercises the full @parisar/i18n runtime so we know
  // the test mirrors production behavior.
  i18n = await createI18nInstance({ lng: "en", ns: ["dashboard"] });
  // Preload hi + mr so changeLanguage("hi") doesn't suspend.
  await i18n.loadLanguages(["en", "hi", "mr"]);
});

function renderSelector(props = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <LanguageSelector open={true} onOpenChange={vi.fn()} {...props} />
    </I18nextProvider>,
  );
}

describe("LanguageSelector", () => {
  it("renders the dialog title in the current language (en → 'Choose language')", async () => {
    renderSelector();
    expect(await screen.findByText("Choose language")).toBeInTheDocument();
  });

  it("renders three rows for English / हिन्दी / मराठी", async () => {
    renderSelector();
    expect(await screen.findByText("English")).toBeInTheDocument();
    expect(screen.getByText("हिन्दी")).toBeInTheDocument();
    expect(screen.getByText("मराठी")).toBeInTheDocument();
  });

  it("marks English as aria-pressed=true (default active locale)", async () => {
    renderSelector();
    const englishLabel = await screen.findByText("English");
    const englishButton = englishLabel.closest("button");
    expect(englishButton).not.toBeNull();
    expect(englishButton.getAttribute("aria-pressed")).toBe("true");
    const hindiButton = screen.getByText("हिन्दी").closest("button");
    expect(hindiButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("tapping हिन्दी calls setLanguageAction('hi') AND useRouter().refresh()", async () => {
    setLanguageActionMock.mockClear();
    refreshMock.mockClear();
    renderSelector();
    const hindiLabel = await screen.findByText("हिन्दी");
    const hindiButton = hindiLabel.closest("button");
    fireEvent.click(hindiButton);
    await waitFor(() => {
      expect(setLanguageActionMock).toHaveBeenCalledWith("hi");
    });
    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });

  // UI-SPEC §Typography lines 249-253 compliance assertion.
  // JSDOM does not resolve CSS variables, so we read the INLINE style.fontFamily
  // string and assert it contains both the `--font-noto-devanagari` variable
  // reference (the bundled-font priority signal) AND the literal
  // "Noto Sans Devanagari" fallback (the explicit font name that survives even
  // if the variable is unresolved).
  it("row label declares the Noto Sans Devanagari font for हिन्दी / मराठी (UI-SPEC §Typography 249-253)", async () => {
    renderSelector();
    const hindiLabel = await screen.findByText("हिन्दी");
    const marathiLabel = screen.getByText("मराठी");
    const englishLabel = screen.getByText("English");

    // Inline style declares the Devanagari font as the first choice.
    expect(hindiLabel.style.fontFamily).toContain("--font-noto-devanagari");
    expect(hindiLabel.style.fontFamily).toContain("Noto Sans Devanagari");
    expect(marathiLabel.style.fontFamily).toContain("--font-noto-devanagari");
    expect(marathiLabel.style.fontFamily).toContain("Noto Sans Devanagari");
    // English row uses the same declaration so row metrics stay aligned.
    expect(englishLabel.style.fontFamily).toContain("--font-noto-devanagari");
  });
});
