"use client";

// The two PIN screens of /verify: enter the existing PIN (second factor) and set
// a new one. Pure presentation; the page owns state and calls the server actions.

import { useId } from "react";
import { useTranslation } from "react-i18next";
import FormError from "./FormError";
import PinField from "./PinField";
import PrimaryButton from "./PrimaryButton";
import Shell from "./VerifyShell";

export function EnterPinStage({ pin, onPinChange, error, loading, onSubmit, onForgot }) {
  const { t } = useTranslation(["auth", "setup-wizard"]);
  return (
    <Shell heading={t("auth.pinSecondFactor")} sub={t("auth.pinStepSub")}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <PinField
            aria-label={t("auth.pinLabel")}
            autoFocus
            autoComplete="current-password"
            value={pin}
            onChange={onPinChange}
            hasError={Boolean(error)}
          />
          <FormError message={error} />
        </div>
        <PrimaryButton
          type="submit"
          label={loading ? t("auth.verifying") : t("auth.continue")}
          loading={loading}
          disabled={pin.length !== 4}
        />
        <button
          type="button"
          onClick={onForgot}
          className="-mx-3 inline-flex min-h-11 items-center justify-center self-center px-3 text-[13px] font-semibold text-(--color-brand-600) hover:underline"
        >
          {t("auth.pinForgot")}
        </button>
      </form>
    </Shell>
  );
}

export function SetPinStage({
  sub,
  pin,
  pin2,
  onPinChange,
  onPin2Change,
  error,
  loading,
  onSubmit,
}) {
  const { t } = useTranslation(["auth", "setup-wizard"]);
  const pinId = useId();
  const confirmId = useId();
  return (
    <Shell heading={t("auth.setPinTitle")} sub={sub}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={pinId} className="text-[13px] font-bold text-neutral-900">
            {t("auth.pinLabel")}
          </label>
          <PinField
            id={pinId}
            autoFocus
            autoComplete="new-password"
            value={pin}
            onChange={onPinChange}
            hasError={Boolean(error)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={confirmId} className="text-[13px] font-bold text-neutral-900">
            {t("auth.setPinConfirm")}
          </label>
          <PinField
            id={confirmId}
            autoComplete="new-password"
            value={pin2}
            onChange={onPin2Change}
            hasError={Boolean(error)}
          />
        </div>
        <FormError message={error} />
        <PrimaryButton
          type="submit"
          label={loading ? t("auth.saving") : t("auth.setPinSave")}
          loading={loading}
          disabled={pin.length !== 4 || pin2.length !== 4}
        />
      </form>
    </Shell>
  );
}
