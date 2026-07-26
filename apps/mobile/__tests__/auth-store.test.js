// Mock the supabase module before importing the store
jest.mock("../lib/supabase", () => ({
  getSupabase: jest.fn(),
}));

// Mock the push-registration helper so signOut() can revoke the device token
// (T-04.1-02) without touching expo-notifications native modules in the test env.
const mockUnregisterPushTokenForDevice = jest.fn().mockResolvedValue(undefined);
jest.mock("../lib/push-registration", () => ({
  unregisterPushTokenForDevice: (...args) => mockUnregisterPushTokenForDevice(...args),
}));

const mockUnsubscribe = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue({});
const mockGetSession = jest.fn().mockResolvedValue({ data: { session: null } });
const mockOnAuthStateChange = jest.fn().mockReturnValue({
  data: { subscription: { unsubscribe: mockUnsubscribe } },
});

const { getSupabase } = require("../lib/supabase");
getSupabase.mockReturnValue({
  auth: {
    getSession: mockGetSession,
    onAuthStateChange: mockOnAuthStateChange,
    signOut: mockSignOut,
  },
});

// Import store AFTER mock is set up
const { useAuthStore } = require("../lib/auth-store");

describe("useAuthStore", () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAuthStore.setState({ session: null, loading: true });
    jest.clearAllMocks();
    // Re-apply mocks after clearAllMocks
    getSupabase.mockReturnValue({
      auth: {
        getSession: mockGetSession,
        onAuthStateChange: mockOnAuthStateChange,
        signOut: mockSignOut,
      },
    });
    mockSignOut.mockResolvedValue({});
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });
    mockUnregisterPushTokenForDevice.mockReset().mockResolvedValue(undefined);
  });

  it("Test 1: initial state is { session: null, loading: true }", () => {
    const state = useAuthStore.getState();
    expect(state.session).toBeNull();
    expect(state.loading).toBe(true);
  });

  it("Test 2: signOut() calls supabase.auth.signOut() and sets session to null", async () => {
    // Set a fake session first
    useAuthStore.setState({ session: { user: { id: "abc" } }, loading: false });

    await useAuthStore.getState().signOut();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().session).toBeNull();
  });

  it("Test 3: initialize() returns an unsubscribe function (not undefined)", () => {
    const result = useAuthStore.getState().initialize();
    expect(typeof result).toBe("function");
  });

  // T-04.1-02 mitigation: sign-out must revoke this device's push token BEFORE
  // clearing the Supabase session so a signed-out device stops receiving pushes.
  describe("signOut push-token revocation (T-04.1-02)", () => {
    it("revokes the device push token BEFORE supabase.auth.signOut", async () => {
      const callOrder = [];
      mockUnregisterPushTokenForDevice.mockImplementation(async () => {
        callOrder.push("unregister");
      });
      mockSignOut.mockImplementation(async () => {
        callOrder.push("signOut");
        return {};
      });

      useAuthStore.setState({ session: { user: { id: "abc" } }, loading: false });
      await useAuthStore.getState().signOut();

      expect(mockUnregisterPushTokenForDevice).toHaveBeenCalledTimes(1);
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(["unregister", "signOut"]);
    });

    it("clears the session via set({ session: null }) after signOut", async () => {
      useAuthStore.setState({ session: { user: { id: "abc" } }, loading: false });
      await useAuthStore.getState().signOut();
      expect(useAuthStore.getState().session).toBeNull();
    });

    it("still signs out even if push-token revoke throws (defensive)", async () => {
      mockUnregisterPushTokenForDevice.mockRejectedValue(new Error("network down"));
      useAuthStore.setState({ session: { user: { id: "abc" } }, loading: false });

      await useAuthStore.getState().signOut();

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().session).toBeNull();
    });
  });
});
