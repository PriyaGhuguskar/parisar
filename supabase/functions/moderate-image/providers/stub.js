// moderate-image provider: STUB (dev default — D-01).
//
// The dev default image-safety provider. Auto-APPROVES every image EXCEPT a
// "magic" filename containing the substring "unsafe" (case-insensitive), which
// it REJECTS. The magic filename is the deterministic reject-path hook used by
// the Phase 6 isolation/smoke test (D-01 discretion): it lets the reject branch
// (storage.remove + ok:false) be exercised without a real CV model.
//
// This is the contract the real provider lights up — vision.js / rekognition.js
// fill the same shape with zero client/migration change (the OTP-adapter promise).
//
// Provider contract: (bytes, filename) -> { verdict: 'pass' | 'reject', labels? }
//   - bytes:    Uint8Array of the downloaded quarantine object (unused by the stub).
//   - filename: the object's basename (e.g. "photo-1.jpg"); the stub keys on this.
//
// JavaScript only — no TS annotations, no type imports, no generics.
export async function moderateStub(_bytes, filename) {
  const isUnsafe =
    typeof filename === "string" && filename.toLowerCase().includes("unsafe");
  return { verdict: isUnsafe ? "reject" : "pass" };
}
