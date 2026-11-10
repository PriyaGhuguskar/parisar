"use client";

// Add or edit a staff member (manager only). Validates on submit, shows errors at
// the field and moves focus to the first invalid one; a server refusal keeps what
// was typed. A new record opens its edit page, where the ID proof can be uploaded
// (attach_proof needs the record to exist). A staff record grants no login, role
// or access: gate guards are still added from the Society profile.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { managerSaveStaff } from "@parisar/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormActions, Notice, PageHeader, PageShell } from "@/components/kit";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { StaffFormFields } from "./StaffFormFields";
import { StaffIdProofs } from "./StaffIdProofs";
import {
  addDays,
  emptyStaffForm,
  formToStaffInput,
  STAFF_FIELDS,
  saveErrorTarget,
  staffToForm,
  validateStaffForm,
} from "./staffFormModel";

function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function focusFirst(errors) {
  const first = STAFF_FIELDS.find((key) => errors[key]);
  if (first) document.getElementById(`staff-${first}`)?.focus();
}

/**
 * @param {{ societyId: string, userId: string, staff?: object|null, justCreated?: boolean }} props
 *   `staff` is the Staff object when editing; omitted to add a new one.
 */
export function StaffForm({ societyId, userId, staff = null, justCreated = false }) {
  const { t } = useTranslation("staff-nav");
  const router = useRouter();
  const editing = Boolean(staff?.id);
  const [form, setForm] = useState(() => (editing ? staffToForm(staff) : emptyStaffForm()));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(justCreated ? "created" : null);
  const today = todayInIndia();

  function onChange(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(null);
    if (errors[key]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  async function save(event) {
    event.preventDefault();
    setFormError(null);
    setSaved(null);
    const found = validateStaffForm(form, { today });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }
    setSaving(true);
    try {
      const res = await managerSaveStaff(
        createSupabaseBrowserClient(),
        formToStaffInput(form, { societyId, staffId: staff?.id ?? null }),
      );
      if (!res || res.error) {
        const target = saveErrorTarget(res?.error);
        if (target.field) {
          const next = { [target.field]: target.key };
          setErrors(next);
          focusFirst(next);
        } else {
          setFormError(t(`staffForm.error.${target.key}`));
        }
        return;
      }
      if (editing) {
        setForm(staffToForm(res));
        setSaved("updated");
        router.refresh();
      } else {
        router.push(`/staff/manage/${res.id}?created=1`);
      }
    } catch (err) {
      console.error("[staff] save failed:", err?.message ?? err);
      setFormError(t("staffForm.error.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const title = editing
    ? [staff.name, staff.last_name].filter(Boolean).join(" ")
    : t("staffForm.addTitle");

  return (
    <PageShell width="narrow">
      <PageHeader
        title={title}
        description={editing ? t(`staffRole.${staff.category}`) : t("staffForm.addLead")}
        backHref="/staff/manage"
        backLabel={t("nav.staffManage")}
      />
      <form onSubmit={save} noValidate className="flex flex-col gap-8">
        {saved ? (
          <Notice tone="success" title={t(`staffForm.saved.${saved}`)}>
            {saved === "created" ? t("staffForm.saved.createdBody") : null}
          </Notice>
        ) : null}
        <Notice tone="info">{t("staffForm.noAccessNote")}</Notice>
        {formError ? <Notice tone="danger">{formError}</Notice> : null}

        <StaffFormFields
          form={form}
          errors={errors}
          onChange={onChange}
          disabled={saving}
          maxJoiningDate={addDays(today, 365)}
        >
          {editing ? (
            <StaffIdProofs societyId={societyId} userId={userId} staffId={staff.id} />
          ) : (
            <p className="type-body-sm text-muted-foreground">{t("staffForm.proofAfterSave")}</p>
          )}
        </StaffFormFields>

        <FormActions
          submitLabel={editing ? t("staffForm.saveChanges") : t("staffForm.addSubmit")}
          submittingLabel={t("staffForm.saving")}
          submitting={saving}
          onCancel={() => router.push("/staff/manage")}
          cancelLabel={t("staffForm.cancel")}
          sticky
        />
      </form>
    </PageShell>
  );
}
