// apps/web/app/(protected)/_components/DetailNotFound.jsx
// Shared "this item isn't here" state for the SSR detail pages (complaint,
// notice, flat action, community post). Server component — the caller passes
// already-translated copy, so this stays i18n-agnostic.
//
// The raw load error is NEVER rendered (it is PostgREST/RPC text, English-only
// and potentially revealing); callers log it server-side and pass `hasError`
// so a localized "couldn't load" line is shown instead.
//
// `_components` is a private folder: Next.js does not route it.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import Link from "next/link";

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.body
 * @param {string|null} [props.errorText]  localized generic error line, or null
 * @param {string} props.backHref
 * @param {string} props.backLabel
 */
export function DetailNotFound({ title, body, errorText = null, backHref, backLabel }) {
  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)] flex flex-col items-center justify-center gap-3 px-8 text-center">
      <h2 className="text-xl font-semibold text-[#171717]">{title}</h2>
      <p className="text-base text-[#525252]">{body}</p>
      {errorText ? <p className="text-sm text-[#6e6e6e]">{errorText}</p> : null}
      <Link
        href={backHref}
        className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-neutral-200 text-sm font-semibold text-[#171717] hover:bg-neutral-50 transition-colors mt-2"
      >
        {backLabel}
      </Link>
    </div>
  );
}

/**
 * Log a detail-page load failure server-side (never shown to the user).
 * @param {string} scope
 * @param {unknown} err
 */
export function logLoadError(scope, err) {
  console.error(`[${scope}] load failed:`, err instanceof Error ? err.message : err);
}
