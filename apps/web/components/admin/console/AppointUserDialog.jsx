"use client";

// Appoint a Parisar staff member or salesperson by mobile number, through the
// createPlatformUser server action (admin-gated before the service role is
// touched). Shown only to admins. Nothing is sent to the person: the success
// message says so and tells the admin to pass the number on.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createPlatformUser } from "@/app/actions/platformUsers";
import { FormField, Notice, PhoneInput, TextInput } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { displayPhone } from "../onboarding/lib/requestFormat";
import { errorText } from "../onboarding/lib/rpc";

const PHONE_RE = /^[6-9]\d{9}$/;

export function AppointUserDialog({ role, onOpenChange, onAppointed }) {
  const { t } = useTranslation("platform");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState(null);
  const [failure, setFailure] = useState(null);
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setFailure(null);
    if (!PHONE_RE.test(phone)) {
      setPhoneError(errorText(t, "INVALID_PHONE"));
      document.getElementById("appoint-phone")?.focus();
      return;
    }
    setPhoneError(null);
    setWorking(true);
    let res;
    try {
      res = await createPlatformUser({ phone, name: name.trim() || undefined, role });
    } catch {
      res = { error: "generic" };
    }
    setWorking(false);
    if (res?.error) {
      if (res.error === "INVALID_PHONE") setPhoneError(errorText(t, res.error));
      else setFailure(errorText(t, res.error));
      return;
    }
    setDone(displayPhone(phone));
    onAppointed?.(role);
  }

  const title = t(role === "sales" ? "appoint.salesTitle" : "appoint.staffTitle");
  return (
    <Dialog open onOpenChange={(open) => (working ? null : onOpenChange(open))}>
      <DialogContent className="gap-5 p-5 shadow-overlay sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="type-h3 font-semibold">{title}</DialogTitle>
          <DialogDescription className="type-body">{t("appoint.description")}</DialogDescription>
        </DialogHeader>
        {done ? (
          <>
            <Notice tone="success">
              {t(role === "sales" ? "appoint.doneSales" : "appoint.doneStaff", { phone: done })}
            </Notice>
            <DialogFooter className="-mx-5 -mb-5 p-4">
              <Button type="button" size="touch" onClick={() => onOpenChange(false)}>
                {t("common.close")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form noValidate onSubmit={submit} className="flex flex-col gap-5">
            <FormField label={t("appoint.name")} optional>
              <TextInput value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label={t("appoint.phone")} required error={phoneError}>
              <PhoneInput
                id="appoint-phone"
                value={phone}
                onChange={(digits) => setPhone(digits)}
              />
            </FormField>
            {failure ? <Notice tone="danger">{failure}</Notice> : null}
            <DialogFooter className="-mx-5 -mb-5 p-4">
              <Button
                type="button"
                variant="outline"
                size="touch"
                disabled={working}
                onClick={() => onOpenChange(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                size="touch"
                disabled={working}
                aria-busy={working || undefined}
              >
                {working ? t("appoint.submitting") : t("appoint.submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
