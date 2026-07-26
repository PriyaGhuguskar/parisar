/**
 * Layout for the member join flow routes: /join/code, /join/profile,
 * /join/success, /join/pending.
 *
 * Minimal — just provides the neutral.50 background and a centered column.
 * Each page manages its own content width.
 */
export default function JoinLayout({ children }) {
  return <div className="min-h-screen bg-[var(--color-neutral-50)]">{children}</div>;
}
