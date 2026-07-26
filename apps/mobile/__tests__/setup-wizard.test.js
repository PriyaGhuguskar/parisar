/**
 * Unit tests for the Phase 3-04 setup wizard components.
 *
 * Tests cover:
 * - WelcomeCard: renders heading + CTA, calls onStart on press
 * - WingsForm: validation (no wings + no toggle), adds wing, removes wing, no-wings toggle
 * - CodeShare: copy + WhatsApp share button present
 * - FlatsForm: add flat, validation
 * - BoardForm: no co-sec placeholder row, co-sec phone warning
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock("@parisar/api-client", () => ({
  createSociety: jest.fn(),
  bootstrapSocietyStructure: jest.fn(),
  finalizeSocietySetup: jest.fn(),
}));

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-linking", () => ({
  canOpenURL: jest.fn().mockResolvedValue(false),
  openURL: jest.fn(),
}));

jest.mock("react-native/Libraries/Share/Share", () => ({
  share: jest.fn().mockResolvedValue({ action: "sharedAction" }),
}));

jest.mock("react-native-svg", () => ({
  Svg: ({ children }) => children,
  Path: () => null,
  Rect: () => null,
  Line: () => null,
}));

// Mock lucide-react-native so icons render as plain View nodes in tests.
// The jest-expo preset does NOT auto-mock it, and lucide uses react-native-svg
// internally which doesn't work in the Jest jsdom/RN environment.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  const mockIcon = ({ testID }) => <View testID={testID} />;
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "__esModule") return true;
        return mockIcon;
      },
    },
  );
});

jest.mock("../lib/supabase", () => ({
  getSupabase: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({ data: null }),
            order: jest.fn(() => ({
              limit: jest.fn().mockResolvedValue({ data: [] }),
            })),
          })),
          maybeSingle: jest.fn().mockResolvedValue({ data: null }),
          order: jest.fn(() => ({
            limit: jest.fn().mockResolvedValue({ data: [] }),
          })),
          limit: jest.fn().mockResolvedValue({ data: [], count: 0 }),
          single: jest.fn().mockResolvedValue({ data: null }),
        })),
        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
        head: jest.fn(() => ({ count: 0 })),
      })),
      insert: jest.fn().mockResolvedValue({ error: null }),
    })),
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: { id: "u1", phone: "919000000001" } }, error: null }),
    },
  })),
}));

jest.mock("../lib/auth-store", () => ({
  useAuthStore: (selector) =>
    selector({
      session: { user: { id: "u1", phone: "919000000001" } },
      loading: false,
    }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("WelcomeCard", () => {
  const { WelcomeCard } = require("../components/setup/WelcomeCard");

  it("renders heading and CTA", () => {
    const { getByText } = render(<WelcomeCard onStart={jest.fn()} />);
    expect(getByText("Set up your society")).toBeTruthy();
    expect(getByText("Get Started")).toBeTruthy();
  });

  it("calls onStart when CTA is pressed", () => {
    const onStart = jest.fn();
    const { getByText } = render(<WelcomeCard onStart={onStart} />);
    fireEvent.press(getByText("Get Started"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("shows alreadySetup hint", () => {
    const { getByText } = render(<WelcomeCard onStart={jest.fn()} />);
    expect(getByText(/Already set up/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
describe("WingsForm", () => {
  const { WingsForm } = require("../components/setup/WingsForm");

  it("shows validation error when Next pressed with no wings and no toggle", () => {
    const { getByText } = render(<WingsForm onNext={jest.fn()} onBack={jest.fn()} />);
    fireEvent.press(getByText("Continue"));
    expect(getByText(/Please add at least one wing/)).toBeTruthy();
  });

  it("adds a wing chip on Add press", () => {
    const { getByPlaceholderText, getByText } = render(
      <WingsForm onNext={jest.fn()} onBack={jest.fn()} />,
    );
    const input = getByPlaceholderText(/e.g. A, B, West Block/);
    fireEvent.changeText(input, "A");
    fireEvent.press(getByText("Add"));
    expect(getByText("A")).toBeTruthy();
  });

  it("calls onNext with Main wing when no-wings toggle is on", () => {
    const onNext = jest.fn();
    const { getByText, getByRole } = render(<WingsForm onNext={onNext} onBack={jest.fn()} />);
    const sw = getByRole("switch");
    fireEvent(sw, "valueChange", true);
    fireEvent.press(getByText("Continue"));
    expect(onNext).toHaveBeenCalledWith({ wings: ["Main"] });
  });

  it("calls onNext with entered wings", () => {
    const onNext = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <WingsForm onNext={onNext} onBack={jest.fn()} />,
    );
    const input = getByPlaceholderText(/e.g. A, B, West Block/);
    fireEvent.changeText(input, "B");
    fireEvent.press(getByText("Add"));
    fireEvent.press(getByText("Continue"));
    expect(onNext).toHaveBeenCalledWith({ wings: ["B"] });
  });

  it("rejects duplicate wing name", () => {
    const { getByPlaceholderText, getAllByText, getByText } = render(
      <WingsForm onNext={jest.fn()} onBack={jest.fn()} />,
    );
    const input = getByPlaceholderText(/e.g. A, B, West Block/);
    fireEvent.changeText(input, "A");
    fireEvent.press(getAllByText("Add")[0]);
    fireEvent.changeText(input, "A");
    fireEvent.press(getAllByText("Add")[0]);
    expect(getByText(/Wing A already added/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
describe("CodeShare", () => {
  const { CodeShare } = require("../components/setup/CodeShare");

  it("renders the society code in a text element", () => {
    const { getByText } = render(<CodeShare code="PAR7-XKM2" />);
    expect(getByText("PAR7-XKM2")).toBeTruthy();
  });

  it("renders the Copy Code button", () => {
    const { getByText } = render(<CodeShare code="TEST-1234" />);
    expect(getByText("Copy Code")).toBeTruthy();
  });

  it("renders the Share via WhatsApp button", () => {
    const { getByText } = render(<CodeShare code="TEST-1234" />);
    expect(getByText("Share via WhatsApp")).toBeTruthy();
  });

  it("renders the Go to Dashboard button", () => {
    const { getByText } = render(<CodeShare code="TEST-1234" />);
    expect(getByText("Go to Dashboard")).toBeTruthy();
  });

  it("calls Clipboard.setStringAsync on Copy press", async () => {
    const Clipboard = require("expo-clipboard");
    const { getByText } = render(<CodeShare code="PAR7-XKM2" />);
    fireEvent.press(getByText("Copy Code"));
    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith("PAR7-XKM2");
    });
  });
});

// ---------------------------------------------------------------------------
describe("BoardForm", () => {
  const { BoardForm } = require("../components/setup/BoardForm");

  const defaultProps = {
    supabase: {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({ data: null }),
          })),
        })),
        insert: jest.fn().mockResolvedValue({ error: null }),
      })),
    },
    societyId: "society-1",
    flatsByWing: { A: [{ id: "f1", number: "101", wing_name: "A" }] },
    coSecPhone: "9000000002",
    onNext: jest.fn(),
    onBack: jest.fn(),
    onSkip: jest.fn(),
  };

  it("shows the Secretary pre-populated locked row", () => {
    const { getByText } = render(<BoardForm {...defaultProps} />);
    expect(getByText("You (Secretary)")).toBeTruthy();
    expect(getByText("Secretary")).toBeTruthy();
  });

  it("does NOT render a Co-Secretary placeholder row", () => {
    const { queryByText } = render(<BoardForm {...defaultProps} />);
    expect(queryByText("Co-Secretary")).toBeNull();
  });

  it("shows info alert with auto-elevation explanation", () => {
    const { getByText } = render(<BoardForm {...defaultProps} />);
    expect(getByText(/already on the board as Secretary/)).toBeTruthy();
  });

  it("shows Skip link", () => {
    const { getByText } = render(<BoardForm {...defaultProps} />);
    expect(getByText("Skip this step")).toBeTruthy();
  });

  it("calls onSkip when Skip is pressed", () => {
    const onSkip = jest.fn();
    const { getByText } = render(<BoardForm {...defaultProps} onSkip={onSkip} />);
    fireEvent.press(getByText("Skip this step"));
    expect(onSkip).toHaveBeenCalled();
  });

  it("warns when entered phone matches co-sec phone", () => {
    const { getByPlaceholderText, getByText } = render(<BoardForm {...defaultProps} />);
    const phoneInput = getByPlaceholderText("98765 43210");
    fireEvent.changeText(phoneInput, "9000000002");
    expect(getByText(/auto-elevated on join/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
describe("FlatsForm", () => {
  const { FlatsForm } = require("../components/setup/FlatsForm");

  const mockSupabase = {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ data: [], count: 0 }),
          maybeSingle: jest.fn().mockResolvedValue({ data: null }),
        })),
      })),
      insert: jest.fn().mockResolvedValue({ error: null }),
    })),
  };

  const defaultProps = {
    supabase: mockSupabase,
    societyId: "society-1",
    wings: ["A", "B"],
    onNext: jest.fn(),
    onBack: jest.fn(),
  };

  it("renders wing sections for each wing", () => {
    const { getByText } = render(<FlatsForm {...defaultProps} />);
    expect(getByText("Wing A")).toBeTruthy();
    expect(getByText("Wing B")).toBeTruthy();
  });

  it("shows secretary flat section", () => {
    const { getByText } = render(<FlatsForm {...defaultProps} />);
    expect(getByText("Which flat is yours?")).toBeTruthy();
  });

  it("shows validation error when no flats added and Save pressed", async () => {
    const { getByText } = render(<FlatsForm {...defaultProps} />);
    fireEvent.press(getByText("Save & Continue"));
    await waitFor(() => {
      expect(getByText(/at least one flat/)).toBeTruthy();
    });
  });

  it("adds a flat chip for a wing", () => {
    const { getAllByPlaceholderText, getAllByText, getByText } = render(
      <FlatsForm {...defaultProps} />,
    );
    const inputs = getAllByPlaceholderText(/e.g. 101, 201A/);
    fireEvent.changeText(inputs[0], "101");
    const addButtons = getAllByText("Add");
    fireEvent.press(addButtons[0]);
    expect(getByText("101")).toBeTruthy();
  });
});
