"use client";

import { useSearchParams } from "next/navigation";
import CodeEntry from "../../../../components/join/CodeEntry";

/**
 * /join/code — Society Code entry page.
 *
 * Supports deep-link pre-fill: /join/code?code=PAR7-XKM2 pre-fills the code input.
 *
 * Flow: code entry → (inline preview) → "Yes, join" → /join/profile
 */
export default function JoinCodePage() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") ?? "";

  return (
    <div className="flex justify-center px-4 py-12">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <CodeEntry initialCode={initialCode} />
      </div>
    </div>
  );
}
