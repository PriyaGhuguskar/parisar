"use client";

// /verify stages for the authority path: choose a society, or "this number is
// not an authority" with a way on as a resident. Shown only after the OTP.

import { useTranslation } from "react-i18next";
import AuthorityPicker from "./AuthorityPicker";
import FormError from "./FormError";
import PrimaryButton from "./PrimaryButton";
import Shell from "./VerifyShell";

export function PickSocietyStage({ societies, loading, error, onPick }) {
  const { t } = useTranslation(["auth", "setup-wizard"]);
  return (
    <Shell
      heading={t("setup-wizard:authLogin.pickTitle")}
      sub={t("setup-wizard:authLogin.pickSub")}
    >
      <div className="flex flex-col gap-4">
        <AuthorityPicker societies={societies} disabled={loading} onPick={onPick} />
        <FormError message={error} />
      </div>
    </Shell>
  );
}

export function NotAuthorityStage({ loading, error, onContinue }) {
  const { t } = useTranslation(["auth", "setup-wizard"]);
  return (
    <Shell
      heading={t("setup-wizard:authLogin.notAuthorityTitle")}
      sub={t("setup-wizard:authLogin.notAuthoritySub")}
    >
      <div className="flex flex-col gap-4">
        <FormError message={error} />
        <PrimaryButton
          type="button"
          label={loading ? t("auth.verifying") : t("setup-wizard:authLogin.continueAsResident")}
          loading={loading}
          onClick={onContinue}
        />
      </div>
    </Shell>
  );
}
