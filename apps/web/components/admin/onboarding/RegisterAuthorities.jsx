"use client";

// Society authorities for the Register Society form. Numbers that came with the
// request are locked: admin_register_society adds every one of them whatever the
// form says, so only their names can change here. Added rows can be removed.

import { Lock, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FormField, Notice, PhoneInput, SurfaceCard, TextInput } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { displayPhone } from "./lib/requestFormat";
import { errorText } from "./lib/rpc";

const MAX_AUTHORITIES = 10;

export function RegisterAuthorities({ authorities, errors, listError, onChange }) {
  const { t } = useTranslation("platform");

  function update(index, patch) {
    onChange(authorities.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function remove(index) {
    onChange(authorities.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...authorities, { name: "", phone: "", fromRequest: false }]);
  }

  return (
    <SurfaceCard className="flex flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 className="type-h3 text-foreground">{t("register.authoritiesSection")}</h2>
        <p className="type-body-sm mt-1 text-muted-foreground">{t("register.authoritiesHint")}</p>
      </div>
      {listError ? <Notice tone="danger">{errorText(t, listError)}</Notice> : null}
      <ol className="flex flex-col gap-4">
        {authorities.map((row, index) => {
          const rowErrors = errors[index] ?? {};
          const number = index + 1;
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: editable rows have no id until saved
              key={index}
              data-testid="authority-row"
              aria-label={t("register.authorityRow", { number })}
              className="grid items-start gap-4 rounded-xl border border-border p-4 sm:grid-cols-[1fr_1fr_auto]"
            >
              <FormField
                label={t("register.authorityName")}
                required
                error={rowErrors.name ? errorText(t, rowErrors.name) : null}
              >
                <TextInput
                  id={`reg-authority-${index}-name`}
                  value={row.name}
                  maxLength={80}
                  onChange={(event) => update(index, { name: event.target.value })}
                />
              </FormField>
              {row.fromRequest ? (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="type-label text-foreground">{t("register.authorityPhone")}</span>
                  <span className="flex h-11 items-center gap-2 rounded-lg bg-muted px-3 tabular-nums text-foreground">
                    <Lock aria-hidden="true" className="size-4 text-muted-foreground" />
                    {displayPhone(row.phone)}
                  </span>
                  <span className="type-body-sm text-muted-foreground">
                    {t("register.authorityLocked")}
                  </span>
                </div>
              ) : (
                <FormField
                  label={t("register.authorityPhone")}
                  required
                  error={rowErrors.phone ? errorText(t, rowErrors.phone) : null}
                >
                  <PhoneInput
                    id={`reg-authority-${index}-phone`}
                    value={row.phone}
                    onChange={(digits) => update(index, { phone: digits })}
                  />
                </FormField>
              )}
              {!row.fromRequest && authorities.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-touch"
                  className="sm:mt-7"
                  onClick={() => remove(index)}
                  aria-label={t("register.removeAuthority", { number })}
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              ) : (
                <span aria-hidden="true" className="hidden sm:block sm:w-11" />
              )}
            </li>
          );
        })}
      </ol>
      {authorities.length < MAX_AUTHORITIES ? (
        <Button type="button" variant="outline" size="touch" className="self-start" onClick={add}>
          <Plus aria-hidden="true" className="size-4" />
          {t("register.addAuthority")}
        </Button>
      ) : null}
    </SurfaceCard>
  );
}
