"use client";

// Frame for every /verify stage: dev OTP hint, change-number link, heading.

import { useTranslation } from "react-i18next";
import AuthShell from "./AuthShell";
import DevOtpHint from "./DevOtpHint";

export default function VerifyShell({ heading, sub, extra, phone, children }) {
  const { t } = useTranslation(["auth", "setup-wizard"]);
  return (
    <AuthShell>
      <div className="flex flex-col gap-6">
        <DevOtpHint phone={phone} />
        <a
          href="/login"
          className="-mx-2 inline-flex min-h-11 items-center self-start px-2 text-[13px] font-semibold text-neutral-600 hover:underline"
        >
          ‹ {t("setup-wizard:authLogin.changeNumber")}
        </a>
        <div className="flex flex-col gap-2">
          <h2 className="text-[30px] font-extrabold leading-[1.12] tracking-[-0.03em] text-neutral-900">
            {heading}
          </h2>
          {sub ? <p className="text-[15px] leading-relaxed text-neutral-600">{sub}</p> : null}
          {extra ? <p className="text-[13px] text-neutral-400">{extra}</p> : null}
        </div>
        {children}
      </div>
    </AuthShell>
  );
}
