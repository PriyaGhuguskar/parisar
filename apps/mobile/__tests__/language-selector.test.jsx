// Phase 7 — Plan 07-03 Task 2: LanguageSelector component test.
//
// Behaviours under test:
//   1. Title + 3 script-native row labels render.
//   2. Active row carries accessibilityState.selected = true (default lng=en).
//   3. Tapping a non-active row calls changeLanguage(lng) then onClose.
//   4. UI-SPEC §Typography lines 249-253: the row label <Text> for हिन्दी and
//      मराठी resolves fontFamily === "NotoSansDevanagari_400Regular".
//      This guards against future regressions where the font-family is dropped
//      from the row labels (the entire reason L10N-03 exists — Devanagari
//      glyphs fail on budget Android without the bundled Noto font).

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { StyleSheet } from "react-native";

// Mock changeLanguage from the mobile i18n helper so we don't need a live
// i18next instance or AsyncStorage in this component-shape test.
const mockChangeLanguage = jest.fn().mockResolvedValue(undefined);
jest.mock("../lib/i18n", () => ({
  changeLanguage: (...args) => mockChangeLanguage(...args),
}));

// Mock useTranslation so the component can render without a provider. The
// fake i18n has `language: "en"` (so English is the active row) and t() looks
// up our 4 known keys + falls back to the key for anything else.
const T = {
  "language.title": "Choose language",
  "language.english": "English",
  "language.hindi": "हिन्दी",
  "language.marathi": "मराठी",
  "language.cancel": "Cancel",
  "language.saveError": "Couldn't save language",
};
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => T[key] ?? key,
    i18n: { language: "en" },
  }),
}));

import { LanguageSelector } from "../components/profile/LanguageSelector";

describe("LanguageSelector — Phase 7 Plan 07-03 Task 2", () => {
  beforeEach(() => {
    mockChangeLanguage.mockClear();
  });

  it("renders the title and three script-native row labels", () => {
    const { getByText } = render(<LanguageSelector visible={true} onClose={() => {}} />);
    expect(getByText("Choose language")).toBeTruthy();
    expect(getByText("English")).toBeTruthy();
    expect(getByText("हिन्दी")).toBeTruthy();
    expect(getByText("मराठी")).toBeTruthy();
  });

  it("marks the active (English) row with accessibilityState.selected = true", () => {
    const { getByLabelText } = render(<LanguageSelector visible={true} onClose={() => {}} />);
    const englishRow = getByLabelText("English");
    expect(englishRow.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    const hindiRow = getByLabelText("हिन्दी");
    expect(hindiRow.props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
  });

  it("tapping the Hindi row calls changeLanguage('hi') and then onClose", async () => {
    const onClose = jest.fn();
    const { getByText } = render(<LanguageSelector visible={true} onClose={onClose} />);
    fireEvent.press(getByText("हिन्दी"));
    await waitFor(() => expect(mockChangeLanguage).toHaveBeenCalledWith("hi"));
    expect(onClose).toHaveBeenCalled();
  });

  it("forwards (lng, name) to onChanged after a successful selection", async () => {
    const onChanged = jest.fn();
    const { getByText } = render(
      <LanguageSelector visible={true} onClose={() => {}} onChanged={onChanged} />,
    );
    fireEvent.press(getByText("मराठी"));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("mr", "मराठी"));
  });

  // --- UI-SPEC §Typography lines 249-253 compliance --------------------------
  // The font-family declaration MUST apply to Language Selector rows so the
  // script-native हिन्दी / मराठी labels render in the bundled Noto Sans
  // Devanagari font, not the device-default font that fails on budget Android.
  //
  // We assert by walking each row's child <Text> and flattening its style with
  // StyleSheet.flatten so an array of style objects collapses into one. The
  // resolved fontFamily must equal the literal "NotoSansDevanagari_400Regular".
  it("Devanagari rows (हिन्दी, मराठी) apply fontFamily = NotoSansDevanagari_400Regular", () => {
    const { getByText } = render(<LanguageSelector visible={true} onClose={() => {}} />);

    const hindiLabel = getByText("हिन्दी");
    const marathiLabel = getByText("मराठी");

    const hindiStyle = StyleSheet.flatten(hindiLabel.props.style);
    const marathiStyle = StyleSheet.flatten(marathiLabel.props.style);

    expect(hindiStyle.fontFamily).toBe("NotoSansDevanagari_400Regular");
    expect(marathiStyle.fontFamily).toBe("NotoSansDevanagari_400Regular");
  });

  it("English row also carries the same fontFamily (UI-SPEC: apply to ALL rows)", () => {
    // The plan spec applies the font to every row — keeps row metrics
    // consistent + the bundled font covers Latin glyphs adequately.
    const { getByText } = render(<LanguageSelector visible={true} onClose={() => {}} />);
    const englishLabel = getByText("English");
    const englishStyle = StyleSheet.flatten(englishLabel.props.style);
    expect(englishStyle.fontFamily).toBe("NotoSansDevanagari_400Regular");
  });
});
