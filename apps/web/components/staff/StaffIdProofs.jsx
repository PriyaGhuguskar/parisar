"use client";

// ID proof documents for one staff record: list, upload, view, remove. Files go to
// the private parisar-proofs bucket under the manager's own folder, then attach_proof
// links them to the staff record (subjectKind "staff", manager only). A file whose
// attach fails is deleted again so nothing is left orphaned. The bucket and RPC
// enforce type, size and the 10-per-record limit; the checks here are feedback.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import {
  attachProof,
  createProofSignedUrl,
  listProofs,
  PROOFS_BUCKET,
  removeProof,
  uploadProofFile,
} from "@parisar/api-client";
import { FileText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ConfirmDialog,
  ErrorState,
  FileUpload,
  FormField,
  formatBytes,
  LoadingState,
  Notice,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const PROOF_ACCEPT = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;

const UPLOAD_ERROR_KEYS = {
  TOO_MANY_PROOFS: "tooMany",
  PROOF_ALREADY_ATTACHED: "alreadyAttached",
  PROOF_UPLOAD_FAILED: "uploadFailed",
  SOCIETY_SERVICE_STOPPED: "serviceStopped",
};

class ProofError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * @param {{ societyId: string, userId: string, staffId: string }} props
 */
export function StaffIdProofs({ societyId, userId, staffId }) {
  const { t } = useTranslation("staff-nav");
  const [proofs, setProofs] = useState([]);
  const [status, setStatus] = useState("loading");
  const [notice, setNotice] = useState(null); // { tone, text }
  const [uploadKey, setUploadKey] = useState(0);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await listProofs(createSupabaseBrowserClient(), {
        subjectKind: "staff",
        subjectId: staffId,
      });
      if (!Array.isArray(res)) throw new ProofError(res?.error ?? "LOAD_FAILED");
      setProofs(res);
      setStatus("ready");
    } catch (err) {
      console.error("[staff proofs] list failed:", err?.message ?? err);
      setStatus("error");
    }
  }, [staffId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(file) {
    const supabase = createSupabaseBrowserClient();
    const up = await uploadProofFile(supabase, { societyId, userId, file });
    if (up?.error) throw new ProofError(up.error);
    const attached = await attachProof(supabase, {
      subjectKind: "staff",
      subjectId: staffId,
      docType: "id_proof",
      storagePath: up.path,
      fileName: file.name,
    });
    if (attached?.error) {
      const { error } = await supabase.storage.from(PROOFS_BUCKET).remove([up.path]);
      if (error) console.error("[staff proofs] orphan cleanup failed:", error.message);
      throw new ProofError(attached.error);
    }
    return attached;
  }

  async function view(proof) {
    setNotice(null);
    const res = await createProofSignedUrl(createSupabaseBrowserClient(), proof.storage_path, 300);
    if (res?.error || !res?.url) {
      setNotice({ tone: "danger", text: t("proofs.viewFailed") });
      return;
    }
    const opened = window.open(res.url, "_blank", "noopener,noreferrer");
    if (!opened) setNotice({ tone: "info", text: t("proofs.popupBlocked"), url: res.url });
  }

  async function confirmRemove() {
    const res = await removeProof(createSupabaseBrowserClient(), removing.id);
    if (res?.error === "PROOF_FILE_NOT_REMOVED") {
      setNotice({ tone: "warning", text: t("proofs.fileStuck") });
    } else if (res?.error) {
      throw new ProofError(res.error);
    } else {
      setNotice({ tone: "success", text: t("proofs.removed") });
    }
    setRemoving(null);
    await load();
  }

  return (
    <div className="flex flex-col gap-4" data-testid="staff-id-proofs">
      {notice ? (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
          {notice.url ? (
            <>
              {" "}
              <a href={notice.url} target="_blank" rel="noopener noreferrer" className="underline">
                {t("proofs.openLink")}
              </a>
            </>
          ) : null}
        </Notice>
      ) : null}

      {status === "loading" ? <LoadingState variant="inline" label={t("proofs.loading")} /> : null}
      {status === "error" ? (
        <ErrorState description={t("proofs.loadFailed")} onRetry={load} />
      ) : null}
      {status === "ready" && proofs.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">{t("proofs.none")}</p>
      ) : null}
      {status === "ready" && proofs.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {proofs.map((proof) => (
            <li key={proof.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="type-body block truncate text-foreground">
                  {proof.file_name || t("proofs.unnamed")}
                </span>
                <span className="type-body-sm text-muted-foreground">
                  {proof.byte_size ? formatBytes(proof.byte_size) : null}
                </span>
              </span>
              <Button type="button" variant="outline" size="touch" onClick={() => view(proof)}>
                {t("proofs.view")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="touch"
                onClick={() => setRemoving(proof)}
              >
                {t("proofs.remove")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <FormField label={t("proofs.uploadLabel")} optional hint={t("proofs.uploadHint")}>
        <FileUpload
          key={uploadKey}
          id="staff-idProofFile"
          accept={PROOF_ACCEPT}
          maxBytes={PROOF_MAX_BYTES}
          upload={upload}
          getErrorMessage={(err) =>
            t(`proofs.error.${UPLOAD_ERROR_KEYS[err?.code] ?? "attachFailed"}`)
          }
          onUploaded={() => {
            setNotice({ tone: "success", text: t("proofs.uploaded") });
            setUploadKey((k) => k + 1);
            load();
          }}
        />
      </FormField>

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t("proofs.removeTitle")}
        description={t("proofs.removeBody", { name: removing?.file_name || t("proofs.unnamed") })}
        confirmLabel={t("proofs.remove")}
        errorMessage={t("proofs.removeFailed")}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
