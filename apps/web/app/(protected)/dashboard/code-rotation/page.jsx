"use client";

import { resumeSocietyCode, rotateSocietyCode } from "@parisar/api-client";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { resolveActiveSociety } from "@/lib/auth/activeSociety";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Page states
// ---------------------------------------------------------------------------
const STATE_LOADING = "loading";
const STATE_ACTIVE = "active"; // code is live — show rotate warning
const STATE_PAUSED = "paused"; // code is paused — show resume/rotate options
const STATE_ROTATED = "rotated"; // rotation succeeded — show new code
const STATE_RESUMED = "resumed"; // resume succeeded — show success
const STATE_ERROR = "error";

/**
 * Code Rotation page — /dashboard/code-rotation
 *
 * Renders as a centered shadcn Dialog (max-width 400px per UI-SPEC line 588).
 * Closing/Done navigates back to /dashboard.
 *
 * Active-code path:
 *   Shows current code + warning block.
 *   "Generate New Code" → rotateSocietyCode → STATE_ROTATED.
 *   "Keep Current Code" → back to /dashboard.
 *
 * Paused-code path:
 *   "Resume Code" → resumeSocietyCode → STATE_RESUMED.
 *   "Rotate to New Code" → rotateSocietyCode → STATE_ROTATED.
 */
export default function CodeRotationPage() {
  const { t } = useTranslation(["auth", "dashboard"]);
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [screenState, setScreenState] = useState(STATE_LOADING);
  const [currentCode, setCurrentCode] = useState(null);
  const [newCode, setNewCode] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  const [societyId, setSocietyId] = useState(null);

  // ---------------------------------------------------------------------------
  // On mount: get session + fetch current code
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/login");
          return;
        }

        const { societyId: sid } = await resolveActiveSociety(supabase, user);

        if (!sid) {
          setError("Society not found. Please go back to the dashboard.");
          setScreenState(STATE_ERROR);
          return;
        }

        if (!cancelled) setSocietyId(sid);

        const { data, error: fetchErr } = await supabase
          .from("society_codes")
          .select("code, paused_at")
          .eq("society_id", sid)
          .is("revoked_at", null)
          .maybeSingle();

        if (fetchErr) throw fetchErr;

        if (!cancelled) {
          setCurrentCode(data?.code ?? null);
          setScreenState(data?.paused_at != null ? STATE_PAUSED : STATE_ACTIVE);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? "Failed to load society code.");
          setScreenState(STATE_ERROR);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  async function handleRotate() {
    if (!societyId || working) return;
    setWorking(true);
    setError(null);
    try {
      const result = await rotateSocietyCode(supabase, { societyId });
      setNewCode(result.code);
      setScreenState(STATE_ROTATED);
    } catch (err) {
      setError(err?.message ?? "Failed to rotate code. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  async function handleResume() {
    if (!societyId || working) return;
    setWorking(true);
    setError(null);
    try {
      await resumeSocietyCode(supabase, { societyId });
      setScreenState(STATE_RESUMED);
    } catch (err) {
      setError(err?.message ?? "Failed to resume code. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  function handleDone() {
    router.push("/dashboard");
  }

  // WhatsApp share link for new code after rotation
  const newJoinUrl = newCode ? `https://parisar.app/join?code=${newCode}` : "";
  const shareMessage = t("setup.shareMessage", {
    link: newJoinUrl,
    defaultValue: `Join our society on Parisar: ${newJoinUrl}`,
  });
  const waUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;

  // ---------------------------------------------------------------------------
  // Code display pill (shared by multiple states)
  // ---------------------------------------------------------------------------
  function CodePill({ value }) {
    return (
      <div className="bg-[var(--color-neutral-100)] rounded-lg p-3 mb-4 text-center">
        <span
          className="font-mono text-xl font-semibold text-[var(--color-brand-500)] tracking-widest select-all"
          aria-label={`Society code: ${value ?? "not loaded"}`}
        >
          {value ?? "—"}
        </span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Dialog is always open; navigating away = done
  // ---------------------------------------------------------------------------
  function handleOpenChange(isOpen) {
    if (!isOpen) handleDone();
  }

  // ---------------------------------------------------------------------------
  // Content varies by state
  // ---------------------------------------------------------------------------
  function renderContent() {
    // Loading
    if (screenState === STATE_LOADING) {
      return (
        <>
          <DialogHeader>
            <DialogTitle>{t("codeRotation.title")}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-8">
            <div
              className="h-8 w-8 rounded-full border-4 border-[var(--color-brand-500)] border-t-transparent animate-spin"
              aria-label="Loading"
            />
          </div>
        </>
      );
    }

    // Error
    if (screenState === STATE_ERROR) {
      return (
        <>
          <DialogHeader>
            <DialogTitle>{t("codeRotation.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--color-danger)] py-4" role="alert">
            {error}
          </p>
          <button
            type="button"
            onClick={handleDone}
            className="h-10 w-full rounded-xl border border-[var(--color-neutral-200)] text-sm font-semibold text-[var(--color-neutral-900)] hover:bg-[var(--color-neutral-50)] transition-colors"
          >
            Go Back
          </button>
        </>
      );
    }

    // Rotated — success
    if (screenState === STATE_ROTATED) {
      return (
        <>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={20} className="text-green-600" aria-hidden="true" />
              <DialogTitle className="text-green-600">
                {t("codeRotation.successHeading")}
              </DialogTitle>
            </div>
          </DialogHeader>
          <CodePill value={newCode} />
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block h-12 w-full rounded-xl bg-green-600 text-white text-sm font-semibold flex items-center justify-center hover:bg-green-700 transition-colors mb-2"
          >
            {t("setup.step6.shareWhatsApp")}
          </a>
          <button
            type="button"
            onClick={handleDone}
            className="h-10 w-full rounded-xl border border-[var(--color-neutral-200)] text-sm font-semibold text-[var(--color-neutral-900)] hover:bg-[var(--color-neutral-50)] transition-colors"
          >
            Done
          </button>
        </>
      );
    }

    // Resumed — success
    if (screenState === STATE_RESUMED) {
      return (
        <>
          <DialogHeader>
            <DialogTitle>{t("codeRotation.title")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center py-4 gap-3">
            <CheckCircle2 size={40} className="text-green-600" aria-hidden="true" />
            <p className="text-lg font-semibold text-green-600 text-center">
              {t("codeRotation.resumedSuccess")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDone}
            className="h-10 w-full rounded-xl bg-[var(--color-brand-500)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </>
      );
    }

    // Paused — resume or rotate-to-new
    if (screenState === STATE_PAUSED) {
      return (
        <>
          <DialogHeader>
            <DialogTitle>{t("codeRotation.pausedHeading")}</DialogTitle>
          </DialogHeader>
          <CodePill value={currentCode} />
          {/* Amber notice */}
          <div className="border border-amber-500 bg-amber-50 rounded-xl p-4 flex items-start gap-3 mb-4">
            <AlertTriangle
              size={20}
              className="text-amber-500 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="text-sm text-[var(--color-neutral-700)]">
              {t("dashboard.code.pausedAlert")}
            </p>
          </div>
          {error && (
            <p className="text-sm text-[var(--color-danger)] mb-3" role="alert">
              {error}
            </p>
          )}
          {/* Resume Code — primary brand.500 */}
          <button
            type="button"
            onClick={handleResume}
            disabled={working}
            className="h-12 w-full rounded-xl bg-[var(--color-brand-500)] text-white text-sm font-semibold mb-3 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {working ? "Working…" : t("codeRotation.resume")}
          </button>
          {/* Rotate to New Code — outlined danger */}
          <button
            type="button"
            onClick={handleRotate}
            disabled={working}
            className="h-10 w-full rounded-xl border border-[var(--color-danger)] text-[var(--color-danger)] text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("codeRotation.rotateToNew")}
          </button>
        </>
      );
    }

    // Active — rotate warning + Generate New / Keep Current
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("codeRotation.title")}</DialogTitle>
        </DialogHeader>
        <CodePill value={currentCode} />
        {/* Warning block */}
        <div className="bg-[var(--color-neutral-100)] rounded-xl p-4 flex items-start gap-3 mb-4">
          <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-[var(--color-neutral-700)]">{t("codeRotation.warning")}</p>
        </div>
        {error && (
          <p className="text-sm text-[var(--color-danger)] mb-3" role="alert">
            {error}
          </p>
        )}
        {/* Generate New Code — destructive danger.500 */}
        <button
          type="button"
          onClick={handleRotate}
          disabled={working}
          className="h-12 w-full rounded-xl bg-[var(--color-danger)] text-white text-sm font-semibold mb-3 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {working ? "Rotating…" : t("codeRotation.confirm")}
        </button>
        {/* Keep Current Code — outlined secondary */}
        <button
          type="button"
          onClick={handleDone}
          disabled={working}
          className="h-10 w-full rounded-xl border border-[var(--color-neutral-200)] text-[var(--color-neutral-900)] text-sm font-semibold hover:bg-[var(--color-neutral-50)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("codeRotation.cancel")}
        </button>
      </>
    );
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[400px]" showCloseButton={screenState !== STATE_LOADING}>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
