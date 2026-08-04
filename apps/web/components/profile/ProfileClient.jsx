"use client";

// ProfileClient — personal profile screen: "Your details" (editable name +
// emergency contact) and the account menu (sign out / transfer Secretary).
// Society management now lives on its own /society page (Society profile).

import { useTranslation } from "react-i18next";
import { ProfileMenuDropdown } from "@/components/dashboard/ProfileMenuDropdown";
import { PageHeader, PageShell } from "@/components/kit";
import { MyProfileCard } from "./MyProfileCard";

export function ProfileClient({ userId, role, societyId, me }) {
  const { t } = useTranslation("auth");
  const { t: tNav } = useTranslation("dashboard");

  return (
    <PageShell>
      <PageHeader
        backHref="/dashboard"
        backLabel={tNav("nav.home")}
        title={t("profile.title")}
        description={t("profile.lead")}
        actions={
          <ProfileMenuDropdown
            userId={userId}
            societyId={societyId ?? null}
            role={role}
            fullName={me.fullName || t("profile.roleMember")}
            flatLabel={me.flatLabel ?? undefined}
          />
        }
      />

      <div className="flex flex-col gap-8">
        <MyProfileCard userId={userId} role={role} me={me} />
      </div>
    </PageShell>
  );
}
