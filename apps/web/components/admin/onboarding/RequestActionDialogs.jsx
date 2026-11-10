"use client";

// The three lifecycle dialogs for an open connect request: mark called, reschedule
// and reject. Each validates like its RPC, then calls it; a failure keeps the dialog
// open with a translated message (ConfirmDialog stays open when onConfirm throws).
// The parent mounts a dialog only while it is open, so every opening starts clean.

import {
  adminMarkConnectCalled,
  adminRejectConnectRequest,
  adminRescheduleConnectRequest,
} from "@parisar/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog, DatePicker, FormField, TextArea, TextInput } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { addDays, todayInIst, validateRejectReason, validateReschedule } from "./lib/requestFormat";
import { errorText, settle } from "./lib/rpc";

const NOTE_MAX = 500;

class DialogError extends Error {}

function useDialogFailure(t) {
  const [message, setMessage] = useState(null);
  function fail(code) {
    setMessage(errorText(t, code));
    throw new DialogError(code);
  }
  return { message, setMessage, fail };
}

export function MarkCalledDialog({ request, onOpenChange, onDone }) {
  const { t } = useTranslation("platform");
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState(null);
  const failure = useDialogFailure(t);

  async function confirm() {
    const trimmed = note.trim();
    if (trimmed.length > NOTE_MAX) {
      setNoteError(errorText(t, "INVALID_NOTE"));
      failure.fail("INVALID_NOTE");
    }
    setNoteError(null);
    const supabase = createSupabaseBrowserClient();
    const res = await settle(() =>
      adminMarkConnectCalled(supabase, { requestId: request.id, note: trimmed || null }),
    );
    if (res.error) failure.fail(res.error);
    onDone(res.data, "called");
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      destructive={false}
      title={t("called.title")}
      description={t("called.description", { name: request.contact_name })}
      confirmLabel={t("called.confirm")}
      workingLabel={t("called.working")}
      cancelLabel={t("common.cancel")}
      errorMessage={failure.message}
      onConfirm={confirm}
    >
      <FormField label={t("called.note")} optional hint={t("called.noteHint")} error={noteError}>
        <TextArea
          value={note}
          maxLength={NOTE_MAX + 50}
          onChange={(e) => setNote(e.target.value)}
        />
      </FormField>
    </ConfirmDialog>
  );
}

const SLOT_FIELD = { SLOT_REQUIRED: "date", SLOT_IN_PAST: "time", SLOT_TOO_FAR: "date" };

export function RescheduleDialog({ request, onOpenChange, onDone }) {
  const { t } = useTranslation("platform");
  const today = todayInIst();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState({});
  const failure = useDialogFailure(t);

  async function confirm() {
    const checked = validateReschedule({ date, time, note });
    if (!checked.ok) {
      setErrors(checked.errors);
      failure.setMessage(t("reschedule.fixFields"));
      throw new DialogError("INVALID");
    }
    setErrors({});
    const supabase = createSupabaseBrowserClient();
    const res = await settle(() =>
      adminRescheduleConnectRequest(supabase, {
        requestId: request.id,
        scheduledAt: checked.scheduledAt,
        note: checked.note,
      }),
    );
    if (res.error) {
      const field = SLOT_FIELD[res.error] ?? (res.error === "INVALID_NOTE" ? "note" : null);
      if (field) setErrors({ [field]: res.error });
      failure.fail(res.error);
    }
    onDone(res.data, "rescheduled");
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      destructive={false}
      title={t("reschedule.title")}
      description={t("reschedule.description")}
      confirmLabel={t("reschedule.confirm")}
      workingLabel={t("reschedule.working")}
      cancelLabel={t("common.cancel")}
      errorMessage={failure.message}
      onConfirm={confirm}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t("reschedule.date")}
          required
          error={errors.date ? errorText(t, errors.date) : null}
        >
          <DatePicker value={date} onChange={setDate} min={today} max={addDays(today, 90)} />
        </FormField>
        <FormField
          label={t("reschedule.time")}
          required
          hint={t("common.istHint")}
          error={errors.time ? errorText(t, errors.time) : null}
        >
          <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </FormField>
      </div>
      <FormField
        label={t("reschedule.note")}
        optional
        hint={t("reschedule.noteHint")}
        error={errors.note ? errorText(t, errors.note) : null}
      >
        <TextArea
          value={note}
          maxLength={NOTE_MAX + 50}
          onChange={(e) => setNote(e.target.value)}
        />
      </FormField>
    </ConfirmDialog>
  );
}

export function RejectDialog({ request, onOpenChange, onDone }) {
  const { t } = useTranslation("platform");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(null);
  const failure = useDialogFailure(t);

  async function confirm() {
    const checked = validateRejectReason(reason);
    if (!checked.ok) {
      setReasonError(errorText(t, checked.error));
      failure.fail(checked.error);
    }
    setReasonError(null);
    const supabase = createSupabaseBrowserClient();
    const res = await settle(() =>
      adminRejectConnectRequest(supabase, { requestId: request.id, reason: checked.reason }),
    );
    if (res.error) {
      if (res.error === "INVALID_REASON") setReasonError(errorText(t, res.error));
      failure.fail(res.error);
    }
    onDone(res.data, "rejected");
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={t("reject.title")}
      description={t("reject.description")}
      confirmLabel={t("reject.confirm")}
      workingLabel={t("reject.working")}
      cancelLabel={t("common.cancel")}
      errorMessage={failure.message}
      onConfirm={confirm}
    >
      <FormField
        label={t("reject.reason")}
        required
        hint={t("reject.reasonHint")}
        error={reasonError}
      >
        <TextArea
          value={reason}
          maxLength={NOTE_MAX + 50}
          onChange={(e) => setReason(e.target.value)}
        />
      </FormField>
    </ConfirmDialog>
  );
}
