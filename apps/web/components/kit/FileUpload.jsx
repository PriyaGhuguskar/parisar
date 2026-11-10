"use client";

// Single-file picker with type and size checks, drag and drop, and upload progress.
//
//   <FormField label="Ownership proof" hint="PDF or photo">
//     <FileUpload
//       accept={[".pdf", "image/*"]}
//       maxBytes={5 * 1024 * 1024}
//       upload={async (file, { onProgress, signal }) => uploadDoc(file)}
//       onUploaded={(result, file) => setPath(result.path)}
//       onRemove={() => setPath(null)}
//     />
//   </FormField>
//
// `upload` does the real work. The bar moves only if it calls onProgress(0-100);
// otherwise it stays indeterminate, because supabase-js reports no progress and a
// made-up percentage would be a lie. "Uploaded" shows only after the promise resolves.
// Without `upload`, `onSelect(file)` hands the checked file over (Excel parsing).
// These checks are for feedback: the server or bucket must enforce them too.

import { CheckCircle2, FileText, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ICON_BUTTON_CLASS } from "./controlStyles";
import { describeAccept, formatBytes, validateFile } from "./lib/fileValidation";
import { Notice } from "./Notice";

const IDLE = { phase: "idle", file: null, progress: null, error: null };

export function FileUpload({
  id,
  name,
  accept = [],
  acceptLabel,
  maxBytes,
  upload,
  onSelect,
  onUploaded,
  onRemove,
  getErrorMessage,
  value,
  disabled = false,
  className,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
}) {
  const { t } = useTranslation("kit");
  const autoId = useId();
  const inputId = id ?? autoId;
  const controllerRef = useRef(null);
  const [state, setState] = useState(IDLE);
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const types = acceptLabel ?? describeAccept(accept);
  const size = maxBytes === undefined ? null : formatBytes(maxBytes);
  const shownFile = state.file ?? value ?? null;
  const uploading = state.phase === "uploading";
  const finished = state.phase === "done" || (state.phase === "idle" && Boolean(value));

  function errorFor(file, code) {
    if (code === "type") return t("file.errorType", { types });
    if (code === "size") return t("file.errorSize", { actual: formatBytes(file.size), size });
    return t("file.errorEmpty");
  }

  async function runUpload(file) {
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setState({ phase: "uploading", file, progress: null, error: null });
    try {
      const result = await upload(file, {
        signal: controller.signal,
        onProgress: (percent) => {
          if (controller.signal.aborted) return;
          const progress = Math.min(100, Math.max(0, Math.round(percent)));
          setState((current) => ({ ...current, progress }));
        },
      });
      if (controller.signal.aborted) return;
      setState({ phase: "done", file, progress: null, error: null });
      onUploaded?.(result, file);
    } catch (err) {
      if (controller.signal.aborted) return;
      const error = getErrorMessage?.(err) || t("file.errorUpload");
      setState({ phase: "failed", file, progress: null, error });
    }
  }

  function accepted(file) {
    const problem = validateFile(file, { accept, maxBytes });
    if (problem) {
      setState({ ...IDLE, phase: "rejected", error: errorFor(file, problem.code) });
      return;
    }
    if (upload) {
      runUpload(file);
      return;
    }
    setState({ phase: "done", file, progress: null, error: null });
    onSelect?.(file);
  }

  function handleInput(event) {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again after an error fires change.
    event.target.value = "";
    if (file) accepted(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file && !disabled && !uploading) accepted(file);
  }

  function handleCancel() {
    controllerRef.current?.abort();
    setState(IDLE);
  }

  function handleRemove() {
    setState(IDLE);
    onRemove?.();
  }

  const showError = state.phase === "failed" || state.phase === "rejected";

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <input
        id={inputId}
        name={name}
        type="file"
        accept={accept.join(",") || undefined}
        disabled={disabled || uploading}
        onChange={handleInput}
        aria-describedby={describedBy}
        aria-invalid={ariaInvalid || showError || undefined}
        className="peer sr-only"
      />
      {finished || uploading ? null : (
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-input bg-card px-4 py-4 text-center transition-colors hover:bg-muted peer-focus-visible:border-ring peer-focus-visible:ring-1 peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
            dragging && "border-ring bg-primary-soft",
            (ariaInvalid || showError) && "border-destructive",
          )}
        >
          <Upload aria-hidden="true" className="size-5 text-muted-foreground" />
          <span className="type-body">
            <span className="font-medium text-primary">{t("file.choose")}</span>{" "}
            <span className="hidden text-muted-foreground sm:inline">{t("file.drop")}</span>
          </span>
          {types || size ? (
            <span className="type-caption text-muted-foreground">
              {types && size
                ? t("file.constraints", { types, size })
                : types || t("file.constraintsSizeOnly", { size })}
            </span>
          ) : null}
        </label>
      )}

      {shownFile && !showError ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card py-1 pr-1 pl-3">
          {finished ? (
            <CheckCircle2
              aria-hidden="true"
              className="size-5 shrink-0 text-status-success-solid"
            />
          ) : (
            <FileText aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1 py-1.5">
            <p className="type-body truncate text-foreground">{shownFile.name}</p>
            {uploading ? (
              <div
                role="progressbar"
                aria-label={t("file.uploading", { name: shownFile.name })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={state.progress ?? undefined}
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={cn(
                    "h-full rounded-full bg-primary transition-[width]",
                    state.progress === null && "w-full animate-pulse",
                  )}
                  style={state.progress === null ? undefined : { width: `${state.progress}%` }}
                />
              </div>
            ) : (
              <output className="type-caption block text-muted-foreground">
                {[
                  shownFile.size === undefined ? null : formatBytes(shownFile.size),
                  upload && finished ? t("file.uploaded") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </output>
            )}
          </div>
          {uploading ? (
            <button
              type="button"
              onClick={handleCancel}
              aria-label={t("file.cancel")}
              className={ICON_BUTTON_CLASS}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          {finished && !disabled ? (
            <button
              type="button"
              onClick={handleRemove}
              aria-label={t("file.remove")}
              className={ICON_BUTTON_CLASS}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
      ) : null}

      {showError ? (
        <Notice
          tone="danger"
          action={
            state.phase === "failed" ? (
              <Button
                type="button"
                variant="outline"
                size="touch"
                onClick={() => runUpload(state.file)}
              >
                {t("file.retry")}
              </Button>
            ) : null
          }
        >
          {state.error}
        </Notice>
      ) : null}
    </div>
  );
}
