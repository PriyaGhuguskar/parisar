// moderate-image adapter selector (D-01 — the OTP-adapter analog).
//
// `MODERATION_PROVIDER` (env) selects the image-safety implementation:
//   stub        -> moderateStub        (dev default; auto-pass except "unsafe" filename)
//   vision      -> moderateVision      (Google Cloud Vision SafeSearch — DEFERRED stub)
//   rekognition -> moderateRekognition (AWS Rekognition — DEFERRED stub)
//
// A real provider plugs in by filling vision.js / rekognition.js and flipping the
// env var — ZERO client or migration change. Every implementation honours the same
// contract: (bytes, filename) -> { verdict: 'pass' | 'reject', labels? }.
//
// Default is "stub" so dev/test work without any external credentials (the
// migration's config.toml already sets MODERATION_PROVIDER = "stub" — Plan 01).
//
// JavaScript only — no TS annotations, no type imports, no generics.
import { moderateStub } from "./stub.js";
import { moderateVision } from "./vision.js";
import { moderateRekognition } from "./rekognition.js";

const PROVIDER = Deno.env.get("MODERATION_PROVIDER") ?? "stub";

export function getModerator() {
  switch (PROVIDER) {
    case "vision":
      return moderateVision;
    case "rekognition":
      return moderateRekognition;
    case "stub":
    default:
      return moderateStub;
  }
}
