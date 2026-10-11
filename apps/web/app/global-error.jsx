"use client";

// PAR-101 — global error boundary (last resort). Catches throws in the root
// layout itself, where a segment `error.jsx` cannot. Must render its own
// <html>/<body>.
//
// Intentionally dependency-light: the root layout (and with it the
// I18nProvider) is exactly what may have crashed, so this cannot rely on
// i18next. It reads the same `parisar_lang` cookie the app uses and picks from
// a tiny built-in table (title / body / retry mirror auth:common.errorTitle,
// common.errorBodyGlobal and common.tryAgain — keep them in sync).

import { LOCALE_COOKIE_NAME, validateLocale } from "../lib/i18n/cookie";

const COPY = {
  en: {
    title: "Something went wrong",
    body: "The app hit an unexpected error. You can try again — your data is safe.",
    retry: "Try again",
    ref: "Ref",
  },
  hi: {
    title: "कुछ गड़बड़ हो गई",
    body: "ऐप में एक अनपेक्षित त्रुटि आई। आप फिर से कोशिश कर सकते हैं — आपका डेटा सुरक्षित है।",
    retry: "फिर से कोशिश करें",
    ref: "संदर्भ",
  },
  mr: {
    title: "काहीतरी चुकले",
    body: "ॲपमध्ये अनपेक्षित त्रुटी आली. तुम्ही पुन्हा प्रयत्न करू शकता — तुमचा डेटा सुरक्षित आहे.",
    retry: "पुन्हा प्रयत्न करा",
    ref: "संदर्भ",
  },
};

function readLocale() {
  try {
    if (typeof document === "undefined") return "en";
    const prefix = `${LOCALE_COOKIE_NAME}=`;
    const entry = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(prefix));
    return validateLocale(entry ? decodeURIComponent(entry.slice(prefix.length)) : null);
  } catch {
    return "en";
  }
}

export default function GlobalError({ error, reset }) {
  const lng = readLocale();
  const copy = COPY[lng] ?? COPY.en;
  return (
    <html lang={lng}>
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
        <div role="alert" style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{copy.title}</h1>
          <p style={{ fontSize: 15, color: "#525252", marginBottom: 20 }}>{copy.body}</p>
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
            {copy.retry}
          </button>
          {error?.digest ? (
            <p style={{ fontSize: 12, color: "#6e6e6e", marginTop: 16 }}>
              {copy.ref}: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
