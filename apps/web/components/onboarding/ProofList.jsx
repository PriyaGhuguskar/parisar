"use client";

// Documents for an owner or tenant record, in the private parisar-proofs bucket.
// Upload goes to the uploader's own folder, then attach_proof links it to the
// record; a file whose attach fails is removed again so nothing is orphaned.
// Only the subject and the society's managers can list or open these.

import {
  attachProof,
  createProofSignedUrl,
  listProofs,
  removeProof,
  uploadProofFile,
} from "@parisar/api-client";
import { ExternalLink, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ConfirmDialog,
  ErrorState,
  FileUpload,
  FormField,
  LoadingState,
  Notice,
  SearchableSelect,
  StatusBadge,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { errorMessage } from "./lib/errors";

export const PROOF_ACCEPT = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;

class CodedError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function ProofList({
  subjectKind,
  subjectId,
  societyId,
  userId,
  docTypes,
  required = [],
  canUpload = true,
}) {
  const { t } = useTranslation("resident-onboarding");
  const [proofs, setProofs] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [docType, setDocType] = useState(required[0] ?? docTypes[0]);
  const [uploadKey, setUploadKey] = useState(0);
  const [notice, setNotice] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [removeError, setRemoveError] = useState(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await listProofs(createSupabaseBrowserClient(), { subjectKind, subjectId });
      if (res?.error) throw new CodedError(res.error);
      setProofs(Array.isArray(res) ? res : []);
    } catch {
      setLoadError(true);
    }
  }, [subjectKind, subjectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(file) {
    const supabase = createSupabaseBrowserClient();
    const up = await uploadProofFile(supabase, { societyId, userId, file });
    if (up.error) throw new CodedError(up.error);
    const res = await attachProof(supabase, {
      subjectKind,
      subjectId,
      docType,
      storagePath: up.path,
      fileName: file.name,
    });
    if (res?.error) {
      await supabase.storage
        .from("parisar-proofs")
        .remove([up.path])
        .catch(() => {});
      throw new CodedError(res.error);
    }
    return res;
  }

  async function onUploaded() {
    setNotice(t("proofs.uploaded", { type: t(`docType.${docType}`) }));
    setUploadKey((k) => k + 1);
    await load();
  }

  async function open(proof) {
    setNotice(null);
    setRemoveError(null);
    // Open the tab inside the click, before the await, or popup blockers stop it.
    const tab = window.open("", "_blank");
    try {
      const res = await createProofSignedUrl(createSupabaseBrowserClient(), proof.storage_path, 60);
      if (res.error) throw new CodedError(res.error);
      if (tab) {
        tab.opener = null;
        tab.location.href = res.url;
      } else {
        window.location.assign(res.url);
      }
    } catch (err) {
      tab?.close();
      setRemoveError(errorMessage(t, err?.code ?? "PROOF_NOT_ACCESSIBLE"));
    }
  }

  async function confirmRemove() {
    const res = await removeProof(createSupabaseBrowserClient(), removing.id);
    if (res?.error && res.error !== "PROOF_FILE_NOT_REMOVED") {
      setRemoveError(errorMessage(t, res));
      throw new CodedError(res.error);
    }
    setRemoving(null);
    // The record is gone either way; say so if the stored file could not be deleted.
    setRemoveError(res?.error ? errorMessage(t, res) : null);
    await load();
  }

  if (loadError) return <ErrorState description={t("proofs.loadError")} onRetry={load} />;
  if (!proofs) return <LoadingState variant="list" rows={2} />;

  const have = new Set(proofs.map((p) => p.doc_type));
  const options = docTypes.map((d) => ({ value: d, label: t(`docType.${d}`) }));

  return (
    <div className="flex flex-col gap-4">
      {required.length ? (
        <ul className="flex flex-col gap-2" aria-label={t("proofs.required")}>
          {required.map((d) => (
            <li key={d} className="flex items-center justify-between gap-3">
              <span className="type-body text-foreground">{t(`docType.${d}`)}</span>
              <StatusBadge
                status={have.has(d) ? "uploaded" : "missing"}
                label={have.has(d) ? t("proofs.have") : t("proofs.missing")}
                tone={have.has(d) ? "success" : "warning"}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {proofs.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {proofs.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="type-body truncate text-foreground">
                  {p.file_name || t(`docType.${p.doc_type}`)}
                </p>
                <p className="type-body-sm text-muted-foreground">{t(`docType.${p.doc_type}`)}</p>
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="touch" onClick={() => open(p)}>
                  <ExternalLink aria-hidden="true" />
                  {t("proofs.view")}
                </Button>
                {p.uploaded_by_me ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    aria-label={t("proofs.remove", {
                      name: p.file_name || t(`docType.${p.doc_type}`),
                    })}
                    onClick={() => {
                      setRemoveError(null);
                      setRemoving(p);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-body-sm text-muted-foreground">{t("proofs.none")}</p>
      )}

      {notice ? (
        <Notice tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Notice>
      ) : null}
      {removeError && !removing ? <Notice tone="danger">{removeError}</Notice> : null}

      {canUpload ? (
        <div className="flex flex-col gap-4 rounded-lg border border-dashed border-input p-4">
          <FormField label={t("proofs.type")} required>
            <SearchableSelect
              options={options}
              value={docType}
              onChange={(v) => v && setDocType(v)}
            />
          </FormField>
          <FormField label={t("proofs.file")} required hint={t("proofs.fileHint")}>
            <FileUpload
              key={uploadKey}
              accept={PROOF_ACCEPT}
              maxBytes={PROOF_MAX_BYTES}
              upload={upload}
              onUploaded={onUploaded}
              getErrorMessage={(err) => errorMessage(t, err?.code)}
            />
          </FormField>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t("proofs.removeTitle")}
        description={t("proofs.removeBody")}
        confirmLabel={t("proofs.removeConfirm")}
        errorMessage={removeError ?? undefined}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
