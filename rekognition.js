// moderate-image provider: AWS REKOGNITION DetectModerationLabels (DEFERRED seam).
//
// This is a DEFERRED stub — the real AWS Rekognition integration is a config-only
// swap chosen later (like the OTP provider). Today it delegates to the stub so
// `MODERATION_PROVIDER=rekognition` is wired end-to-end without credentials;
// flipping to the real call is a no-client-change edit here.
//
// TODO: real AWS Rekognition — see 06-RESEARCH §Standard Stack decision branch.
//   Shape when implemented:
//     Rekognition.detectModerationLabels({ Image: { Bytes: bytes } })
//     Returns ModerationLabels[] with Confidence.
//     Map any label with Confidence >= threshold (e.g. 80) -> verdict: "reject".
//   Requires AWS creds + region in env (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
//   / AWS_REGION) — deferred (D-01). On ANY API error the index.js orchestrator
//   fails CLOSED.
//
// Provider contract: (bytes, filename) -> { verdict: 'pass' | 'reject', labels? }
//
// JavaScript only — no TS annotations, no type imports, no generics.
import { moderateStub } from "./stub.js";

export async function moderateRekognition(bytes, filename) {
  // DEFERRED: delegate to the stub until the real Rekognition call is wired.
  return moderateStub(bytes, filename);
}
