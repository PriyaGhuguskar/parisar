"use client";

// PAR-101 — global error boundary (last resort). Catches throws in the root
// layout itself, where a segment `error.jsx` cannot. Must render its own
// <html>/<body>. Intentionally dependency-light (no i18n — the thing that
// crashed may BE i18n) with a plain, safe English fallback + a retry.

export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fafafa",
          color: "#171717",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 15, color: "#525252", marginBottom: 20 }}>
            The app hit an unexpected error. You can try again — your data is safe.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              height: 44,
              padding: "0 24px",
              borderRadius: 12,
              border: "none",
              background: "#12715A",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error?.digest ? (
            <p style={{ fontSize: 12, color: "#6e6e6e", marginTop: 16 }}>Ref: {error.digest}</p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
