// Minimal unauthenticated layout wrapper — no server-side auth check.
// The (protected) group has the auth guard; (auth) routes are public.

export default function AuthLayout({ children }) {
  return <>{children}</>;
}
