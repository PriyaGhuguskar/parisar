// apps/mobile/lib/login-route-gate.js
// One owner for "where does this signed-in user go?".
//
// resolvePostLoginRoute() is not side-effect free: it runs claim_guard /
// claim_society_authority / claim_family_membership and refreshes the session.
// When verify and the splash both ran it (verifyOtp flips the route guard, so
// the splash mounts while verify is still mid-flight), every claim ran twice.
// The splash is now the only caller, and this gate also collapses re-mounts
// (React StrictMode, guard flips) onto the one in-flight resolution per user.
//
// JavaScript only — no TypeScript per CLAUDE.md.

/** @type {{ userId: string, promise: Promise<string> } | null} */
let inFlight = null;

/**
 * Run `resolve` once per user at a time; concurrent callers share the result.
 * @param {string} userId
 * @param {() => Promise<string>} resolve
 * @returns {Promise<string>}
 */
export function resolveRouteOnce(userId, resolve) {
  if (inFlight && inFlight.userId === userId) return inFlight.promise;
  const promise = Promise.resolve()
    .then(resolve)
    .finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
  inFlight = { userId, promise };
  return promise;
}

/** True while a resolution is running (for tests / diagnostics). */
export function isResolvingRoute() {
  return inFlight !== null;
}

/** Forget any in-flight resolution (sign-out). */
export function resetRouteGate() {
  inFlight = null;
}
