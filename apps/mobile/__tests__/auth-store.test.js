// Mock the supabase module before importing the store
jest.mock("../lib/supabase", () => ({
  getSupabase: jest.fn(),
}));

// signOut() revokes the device token (T-04.1-02) through the scoped client's
// unregister_push_token RPC (migration 055). Native modules are mocked.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: "proj-1" } } } },
}));
jest.mock("expo-notifications", () => ({
  getExpoPushTokenAsync: jest.fn(async () => ({ data: "ExponentPushToken[dev]" })),
}));
// "unregister" = the RPC call on the scoped client.
const mockUnregisterPushTokenForDevice = jest.fn().mockResolvedValue({ data: true, error: null });

// signOut builds a throwaway client bound to the captured access token for the
// post-sign-out push cleanup.
const mockScopedClient = {
  scoped: true,
  rpc: (...args) => mockUnregisterPushTokenForDevice(...args),
};
const mockCreateClient = jest.fn(() => mockScopedClient);
jest.mock("@supabase/supabase-js", () => ({
  createClient: (...args) => mockCreateClient(...args),
}));

const mockDashboardReset = jest.fn();
jest.mock("../lib/dashboard-summary-store", () => ({
  useDashboardSummary: { getState: () => ({ reset: mockDashboardReset }) },
}));

const mockResetMyContext = jest.fn();
jest.mock("../lib/use-my-context", () => ({
  resetMyContext: (...args) => mockResetMyContext(...args),
}));

const mockUnsubscribe = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue({});
const mockGetSession = jest.fn().mockResolvedValue({ data: { session: null } });
const SESSION_WITH_TOKEN = { data: { session: { access_token: "tok-abc" } } };
const mockOnAuthStateChange = jest.fn().mockReturnValue({
  data: { subscription: { unsubscribe: mockUnsubscribe } },
});

const { getSupabase } = require("../lib/supabase");
getSupabase.mockReturnValue({
  supabaseUrl: "http://sb.test",
  supabaseKey: "anon-key",
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
      supabaseUrl: "http://sb.test",
      supabaseKey: "anon-key",
      auth: {
        getSession: mockGetSession,
        onAuthStateChange: mockOnAuthStateChange,
        signOut: mockSignOut,
      },
    });
    mockCreateClient.mockImplementation(() => mockScopedClient);
    mockSignOut.mockResolvedValue({});
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });
    mockUnregisterPushTokenForDevice.mockReset().mockResolvedValue({ data: true, error: null });
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

  // CODE-REVIEW M12: sign out FIRST (nothing may keep the user signed in),
  // then revoke this device's push token best-effort, bounded by a timeout,
  // using the access token captured before signing out.
  describe("signOut push-token revocation (T-04.1-02)", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue(SESSION_WITH_TOKEN);
    });

    it("signs out BEFORE revoking the device push token", async () => {
      const callOrder = [];
      mockUnregisterPushTokenForDevice.mockImplementation(async () => {
        callOrder.push("unregister");
        return { data: true, error: null };
      });
      mockSignOut.mockImplementation(async () => {
        callOrder.push("signOut");
        return {};
      });

      useAuthStore.setState({ session: { user: { id: "abc" } }, loading: false });
      await useAuthStore.getState().signOut();

      expect(callOrder).toEqual(["signOut", "unregister"]);
    });

    it("revokes with a client bound to the captured access token", async () => {
      useAuthStore.setState({ session: { user: { id: "abc" } }, loading: false });
      await useAuthStore.getState().signOut();

      expect(mockCreateClient).toHaveBeenCalledWith(
        "http://sb.test",
        "anon-key",
        expect.objectContaining({
          global: { headers: { Authorization: "Bearer tok-abc" } },
        }),
      );
      expect(mockUnregisterPushTokenForDevice).toHaveBeenCalledWith("unregister_push_token", {
        p_token: "ExponentPushToken[dev]",
      });
    });

    it("clears the session and per-user caches", async () => {
      useAuthStore.setState({ session: { user: { id: "abc" } }, loading: false });
      await useAuthStore.getState().signOut();
      expect(useAuthStore.getState().session).toBeNull();
      expect(mockDashboardReset).toHaveBeenCalledTimes(1);
      expect(mockResetMyContext).toHaveBeenCalledTimes(1);
    });

    it("still signs out even if push-token revoke throws (defensive)", async () => {
      mockUnregisterPushTokenForDevice.mockRejectedValue(new Error("network down"));
      useAuthStore.setState({ session: { user: { id: "abc" } }, loading: false });

      await useAuthStore.getState().signOut();

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().session).toBeNull();
    });

    it("does not wait forever for a hung push revoke", async () => {
      jest.useFakeTimers();
      try {
        mockUnregisterPushTokenForDevice.mockImplementation(() => new Promise(() => {}));
        useAuthStore.setState({ session: { user: { id: "abc" } }, loading: false });
        const done = useAuthStore.getState().signOut();
        await jest.advanceTimersByTimeAsync(3100);
        await expect(done).resolves.toBeUndefined();
        expect(useAuthStore.getState().session).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it("skips the revoke when there was no session token", async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      await useAuthStore.getState().signOut();
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockUnregisterPushTokenForDevice).not.toHaveBeenCalled();
    });
  });
});
