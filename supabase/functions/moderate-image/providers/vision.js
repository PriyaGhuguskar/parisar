// moderate-image provider: GOOGLE CLOUD VISION SafeSearch (DEFERRED seam).
//
// This is a DEFERRED stub — the real Google Cloud Vision SafeSearch integration
// is a config-only swap chosen later (like the OTP provider). Today it delegates
// to the stub so `MODERATION_PROVIDER=vision` is wired end-to-end without
// credentials; flipping to the real call is a no-client-change edit here.
//
// TODO: real Google Vision SafeSearch — see 06-RESEARCH §Standard Stack decision
// branch. Shape when implemented:
//   POST https://vision.googleapis.com/v1/images:annotate
//     feature: { type: "SAFE_SEARCH_DETECTION" }
//     image:   { content: base64(bytes) }
//   Read response safeSearchAnnotation.adult / .violence / .racy / .medical / .spoof.
//   Map LIKELY | VERY_LIKELY on any sensitive axis -> verdict: "reject".
//   Requires a GCP service-account / API key in env (GOOGLE_VISION_API_KEY) —
//   deferred (D-01). On ANY API error the index.js orchestrator fails CLOSED.
//
// Provider contract: (bytes, filename) -> { verdict: 'pass' | 'reject', labels? }
//
// JavaScript only — no TS annotations, no type imports, no generics.
import { moderateStub } from "./stub.js";

export async function moderateVision(bytes, filename) {
  // DEFERRED: delegate to the stub until the real Vision call is wired.
  return moderateStub(bytes, filename);
}
