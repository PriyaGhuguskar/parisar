"use client";

// /import: bring residents in from Excel.
//
//   Download template -> Upload -> Validate -> Preview -> Import valid records
//                                                     -> Download error report
//                                                     -> Cancel
//
// The browser only parses (exceljs, loaded on demand). import_validate_rows checks
// every row on the server and stores the batch; import_confirm_batch re-checks and
// creates pending resident records. Nothing is sent to residents: each record
// waits until that person signs in with the mobile and confirms it.

import {
  importCancelBatch,
  importConfirmBatch,
  importGetBatch,
  importValidateRows,
} from "@parisar/api-client";
import { Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ConfirmDialog,
  FileUpload,
  FormField,
  Notice,
  PageHeader,
  PageShell,
  SurfaceCard,
} from "@/components/kit";
import { callRpc } from "@/components/setup/lib/rpc";
import { errorText } from "@/components/setup/lib/setupModel";
import { Button } from "@/components/ui/button";
import { ImportPreview } from "./ImportPreview";
import {
  buildErrorReport,
  buildTemplate,
  downloadWorkbook,
  MAX_FILE_BYTES,
  MAX_ROWS,
  parseWorkbook,
} from "./lib/excel";
import {
  fetchAllRows,
  importable,
  parseErrorKey,
  reportRows,
  rowProblems,
  summary,
} from "./lib/importModel";
import { RecentImports } from "./RecentImports";

export function ImportResidents({ societyId, societyCode }) {
  const { t } = useTranslation("setup-wizard");
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [busy, setBusy] = useState(null); // template | validate | confirm | report | open
  const [batch, setBatch] = useState(null);
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState(null); // { tone, title?, text }
  const [result, setResult] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openingId, setOpeningId] = useState(null);
  const [uploadKey, setUploadKey] = useState(0);

  function reset() {
    setBatch(null);
    setRows([]);
    setResult(null);
    setFile(null);
    setUploadKey((k) => k + 1);
  }

  async function downloadTemplate() {
    setBusy("template");
    setMessage(null);
    try {
      const buffer = await buildTemplate({
        societyCode,
        instructions: [1, 2, 3, 4, 5].map((n) => t(`import.instructions.${n}`)),
      });
      downloadWorkbook(buffer, "parisar-residents-template.xlsx");
    } catch {
      setMessage({ tone: "danger", text: t("import.templateFailed") });
    }
    setBusy(null);
  }

  async function validate() {
    setMessage(null);
    if (!file) {
      setFileError(t("import.fileRequired"));
      return;
    }
    setBusy("validate");
    let parsed;
    try {
      parsed = await parseWorkbook(await file.arrayBuffer());
    } catch {
      parsed = { error: "UNREADABLE" };
    }
    if (parsed.error) {
      setBusy(null);
      setFileError(
        t(parseErrorKey(parsed.error), {
          max: MAX_ROWS,
          columns: (parsed.missing ?? []).join(", "),
        }),
      );
      return;
    }
    const res = await callRpc((sb) =>
      importValidateRows(sb, { societyId, fileName: file.name, rows: parsed.rows }),
    );
    setBusy(null);
    if (res.error) {
      setMessage({ tone: "danger", text: errorText(t, res.error) });
      return;
    }
    setBatch(res.data);
    setRows(res.data?.rows ?? []);
    setRefreshKey((k) => k + 1);
  }

  async function confirm() {
    setBusy("confirm");
    setMessage(null);
    const res = await callRpc((sb) => importConfirmBatch(sb, batch.batch_id));
    if (res.error) {
      setBusy(null);
      setMessage({ tone: "danger", text: errorText(t, res.error) });
      return;
    }
    const all = await callRpc((sb) =>
      fetchAllRows((input) => importGetBatch(sb, input), batch.batch_id, null),
    );
    setBusy(null);
    setBatch(res.data);
    if (all.data?.rows) setRows(all.data.rows);
    setResult(res.data);
    setRefreshKey((k) => k + 1);
  }

  async function downloadReport() {
    setBusy("report");
    try {
      const buffer = await buildErrorReport(reportRows(rows), {
        headers: {
          row: t("import.col.row"),
          status: t("import.col.status"),
          problems: t("import.col.issues"),
        },
        status: (s) => t(`import.rowStatus.${s}`),
        problems: (row) => rowProblems(t, row),
      });
      downloadWorkbook(
        buffer,
        `parisar-import-errors-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch {
      setMessage({ tone: "danger", text: t("import.reportFailed") });
    }
    setBusy(null);
  }

  async function cancelBatch() {
    setCancelError(null);
    const res = await callRpc((sb) => importCancelBatch(sb, batch.batch_id));
    if (res.error) {
      setCancelError(errorText(t, res.error));
      throw new Error(res.error);
    }
    reset();
    setRefreshKey((k) => k + 1);
    setMessage({ tone: "info", text: t("import.cancelled") });
  }

  async function openBatch(b) {
    setOpeningId(b.batch_id);
    setMessage(null);
    const res = await callRpc((sb) =>
      fetchAllRows((input) => importGetBatch(sb, input), b.batch_id, null),
    );
    setOpeningId(null);
    if (res.error || res.data?.error) {
      setMessage({ tone: "danger", text: errorText(t, res.error ?? res.data.error) });
      return;
    }
    setResult(null);
    setBatch(b);
    setRows(res.data.rows);
  }

  const canImport = importable(batch);
  const problems = reportRows(rows).length;
  const s = summary(batch);

  return (
    <PageShell width="wide">
      <PageHeader
        title={t("import.title")}
        description={t("import.lead")}
        backHref="/society-dashboard"
        backLabel={t("import.back")}
      />
      <div className="flex flex-col gap-8">
        <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="type-h3 text-foreground">{t("import.stepTemplate")}</h2>
              <p className="type-body-sm mt-1 text-muted-foreground">
                {t("import.templateLead", { max: MAX_ROWS })}
              </p>
              {societyCode ? (
                <p className="type-body-sm mt-2 text-foreground">
                  {t("import.yourCode")}{" "}
                  <span className="font-semibold tabular-nums">{societyCode}</span>
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={busy === "template"}
              onClick={downloadTemplate}
            >
              <Download aria-hidden="true" className="size-4" />
              {busy === "template" ? t("import.preparing") : t("import.downloadTemplate")}
            </Button>
          </div>

          {!batch ? (
            <>
              <FormField
                label={t("import.fileLabel")}
                required
                hint={t("import.fileHint", { size: "2 MB", max: MAX_ROWS })}
                error={fileError}
              >
                <FileUpload
                  key={uploadKey}
                  accept={[".xlsx"]}
                  maxBytes={MAX_FILE_BYTES}
                  disabled={busy === "validate"}
                  onSelect={(f) => {
                    setFile(f);
                    setFileError(null);
                  }}
                  onRemove={() => setFile(null)}
                />
              </FormField>
              <Button
                type="button"
                size="touch"
                className="self-start"
                disabled={busy === "validate"}
                onClick={validate}
              >
                {busy === "validate" ? t("import.validating") : t("import.validate")}
              </Button>
            </>
          ) : null}
        </SurfaceCard>

        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

        {batch ? (
          <section className="flex flex-col gap-5" aria-labelledby="import-preview-title">
            <div className="flex flex-col gap-1">
              <h2 id="import-preview-title" className="type-h2 text-foreground">
                {t("import.previewTitle")}
              </h2>
              <p className="type-body-sm text-muted-foreground">
                {batch.file_name ?? file?.name ?? ""}
              </p>
            </div>
            {result ? (
              <Notice
                tone="success"
                title={t("import.importedTitle", { count: result.imported ?? s.imported })}
              >
                {t("import.importedBody")}
                {result.newly_invalid?.length
                  ? ` ${t("import.newlyInvalid", { count: result.newly_invalid.length })}`
                  : ""}
              </Notice>
            ) : s.errors ? (
              <Notice tone="warning">{t("import.hasErrors", { count: s.errors })}</Notice>
            ) : null}
            <ImportPreview batch={batch} rows={rows} />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {!result && batch.status === "validated" ? (
                <Button
                  type="button"
                  size="touch"
                  disabled={!canImport || Boolean(busy)}
                  onClick={confirm}
                >
                  {busy === "confirm"
                    ? t("import.importing")
                    : t("import.importValid", { count: canImport })}
                </Button>
              ) : null}
              {problems ? (
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  disabled={Boolean(busy)}
                  onClick={downloadReport}
                >
                  <Download aria-hidden="true" className="size-4" />
                  {busy === "report" ? t("import.preparing") : t("import.downloadReport")}
                </Button>
              ) : null}
              {!result && batch.status === "validated" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  disabled={Boolean(busy)}
                  onClick={() => setCancelOpen(true)}
                >
                  {t("import.cancel")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  disabled={Boolean(busy)}
                  onClick={reset}
                >
                  {t("import.another")}
                </Button>
              )}
            </div>
            {!result && batch.status === "validated" && !canImport ? (
              <p className="type-body-sm text-muted-foreground">{t("import.nothingValid")}</p>
            ) : null}
          </section>
        ) : null}

        <RecentImports
          societyId={societyId}
          refreshKey={refreshKey}
          onOpen={openBatch}
          openingId={openingId}
        />
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t("import.cancelTitle")}
        description={t("import.cancelBody")}
        confirmLabel={t("import.cancelConfirm")}
        errorMessage={cancelError}
        onConfirm={cancelBatch}
      />
    </PageShell>
  );
}
