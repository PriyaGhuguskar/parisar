"use client";

// The list of authority numbers on a Connect With Us request. The contact's own number
// is always the first one (the RPC adds it), so it is shown read-only at the top; the
// visitor can add up to five more and remove any of them.

import { Plus, Trash2, UserRound } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FormField, PhoneInput, TextInput } from "@/components/kit";
import { ICON_BUTTON_CLASS } from "@/components/kit/controlStyles";
import { isValidIndianMobile } from "@/components/kit/lib/phone";
import { Button } from "@/components/ui/button";
import { AUTHORITY_NAME_MAX, MAX_EXTRA_AUTHORITIES } from "./lib/connectForm";

function formatLocal(digits) {
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export function AuthorityNumbersField({
  contactName,
  contactPhone,
  rows,
  errors = {},
  listError,
  onAdd,
  onRemove,
  onRowChange,
  disabled = false,
}) {
  const { t } = useTranslation("connect");
  const focusAfter = useRef(null);
  const canAdd = rows.length < MAX_EXTRA_AUTHORITIES;
  const youValid = isValidIndianMobile(contactPhone);

  // After add, focus the new row's number; after remove, focus "Add" (or the list).
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const el = document.getElementById(target === "add" ? "connect-authority-add" : target);
    (el ?? document.getElementById("connect-authority-list"))?.focus();
  });

  function add() {
    const id = onAdd();
    focusAfter.current = `connect-authority-${id}-phone`;
  }

  function remove(id) {
    onRemove(id);
    focusAfter.current = "add";
  }

  return (
    <div className="flex flex-col gap-4">
      <ul id="connect-authority-list" tabIndex={-1} className="flex flex-col gap-3 outline-none">
        <li className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-muted px-3 py-2.5">
          <UserRound aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="type-body-sm font-medium text-foreground">
              {contactName.trim() || t("form.authorityYou")}
            </p>
            <p className="type-body-sm tabular-nums text-muted-foreground">
              {youValid ? formatLocal(contactPhone) : t("form.authorityYourNumber")}
            </p>
          </div>
        </li>
        {rows.map((row, index) => {
          const n = index + 2;
          const rowErrors = errors[row.id] ?? {};
          return (
            <li key={row.id}>
              <fieldset className="relative rounded-lg border border-border p-3 sm:p-4">
                <legend className="type-label float-left mb-3 w-full pr-12 text-foreground">
                  {t("form.authorityRow", { n })}
                </legend>
                <button
                  type="button"
                  onClick={() => remove(row.id)}
                  disabled={disabled}
                  aria-label={t("form.authorityRemove", { n })}
                  className={`${ICON_BUTTON_CLASS} absolute top-0.5 right-0.5 hover:text-destructive`}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
                <div className="clear-both grid gap-4 sm:grid-cols-2">
                  <FormField
                    label={t("form.authorityPhone")}
                    required
                    error={rowErrors.phone && t(rowErrors.phone)}
                  >
                    <PhoneInput
                      id={`connect-authority-${row.id}-phone`}
                      value={row.phone}
                      disabled={disabled}
                      onChange={(digits) => onRowChange(row.id, { phone: digits })}
                    />
                  </FormField>
                  <FormField
                    label={t("form.authorityName")}
                    optional
                    error={rowErrors.name && t(rowErrors.name)}
                  >
                    <TextInput
                      id={`connect-authority-${row.id}-name`}
                      value={row.name}
                      disabled={disabled}
                      autoComplete="off"
                      maxLength={AUTHORITY_NAME_MAX + 20}
                      placeholder={t("form.authorityNamePh")}
                      onChange={(e) => onRowChange(row.id, { name: e.target.value })}
                    />
                  </FormField>
                </div>
              </fieldset>
            </li>
          );
        })}
      </ul>

      {canAdd ? (
        <Button
          id="connect-authority-add"
          type="button"
          variant="outline"
          size="touch"
          className="self-start"
          disabled={disabled}
          onClick={add}
        >
          <Plus aria-hidden="true" />
          {t("form.authorityAdd")}
        </Button>
      ) : (
        <p className="type-body-sm text-muted-foreground">
          {t("form.authorityLimit", { max: MAX_EXTRA_AUTHORITIES })}
        </p>
      )}
      {listError ? (
        <p role="alert" className="type-body-sm text-destructive">
          {t(listError)}
        </p>
      ) : null}
    </div>
  );
}
