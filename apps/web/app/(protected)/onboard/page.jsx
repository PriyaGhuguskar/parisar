"use client";

import { Shield, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import AuthShell from "../../../components/auth/AuthShell";
import FormError from "../../../components/auth/FormError";
import PrimaryButton from "../../../components/auth/PrimaryButton";
import RoleCard from "../../../components/auth/RoleCard";
import LogoutButton from "../../../components/LogoutButton";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";

// Role-picker for new users. Writes profiles.signup_intent + full_name.
// Runs browser-side so we can call getUser() and insert via the authenticated client.

export default function OnboardPage() {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState(null); // 'secretary' | 'member'
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const isReady = selectedRole !== null && name.trim().length >= 2;

  async function handleContinue(e) {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError(t("auth.nameRequired"));
      return;
    }
    if (!selectedRole) return;

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError(t("auth.networkError"));
        return;
      }

      const { error: insertError } = await supabase.from("profiles").insert({
        user_id: user.id,
        full_name: name.trim(),
        phone: user.phone ? "+" + user.phone : null,
        signup_intent: selectedRole, // 'secretary' | 'member'
      });

      if (insertError) {
        setError(t("auth.networkError"));
        return;
      }

      router.push(selectedRole === "secretary" ? "/setup/society" : "/join/code");
    } catch {
      setError(t("auth.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-neutral-50)]">
      {/* Header with logout */}
      <header className="bg-[var(--color-neutral-0)] border-b border-[var(--color-neutral-200)] px-4 h-14 flex items-center justify-between">
        <span className="text-xl font-semibold text-[var(--color-brand-500)]">
          {t("common.appName")}
        </span>
        <LogoutButton />
      </header>

      {/* Form — centered column, max-w-sm */}
      <div className="flex justify-center px-4 py-8">
        <div className="w-full max-w-sm flex flex-col gap-6">
          {/* Heading */}
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-[var(--color-neutral-900)] leading-tight">
              {t("auth.roleSelectHeading")}
            </h2>
            <p className="text-base text-[var(--color-neutral-600)] leading-relaxed">
              {t("auth.roleSelectSubheading")}
            </p>
          </div>

          <form onSubmit={handleContinue} className="flex flex-col gap-4">
            {/* Role cards — stacked vertically (D5: Devanagari needs full width) */}
            <div className="flex flex-col gap-4">
              <RoleCard
                icon={Shield}
                title={t("auth.roleSecretary")}
                description={t("auth.roleSecretaryDesc")}
                selected={selectedRole === "secretary"}
                onSelect={() => setSelectedRole("secretary")}
              />
              <RoleCard
                icon={Users}
                title={t("auth.roleMember")}
                description={t("auth.roleMemberDesc")}
                selected={selectedRole === "member"}
                onSelect={() => setSelectedRole("member")}
              />
            </div>

            {/* Name input */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="full-name"
                className="text-sm text-[var(--color-neutral-600)] font-normal leading-snug"
              >
                {t("auth.nameLabel")}
              </label>
              <input
                id="full-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder={t("auth.namePlaceholder")}
                className={[
                  "w-full h-12 px-3 rounded-lg border text-base outline-none transition-colors",
                  "bg-[var(--color-neutral-0)] text-[var(--color-neutral-900)]",
                  "placeholder:text-[var(--color-neutral-400)]",
                  "border-[var(--color-neutral-200)]",
                  "focus:border-[var(--color-brand-700)] focus:ring-2 focus:ring-[var(--color-brand-700)]/20",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </div>

            <FormError message={error} />

            <PrimaryButton
              type="submit"
              label={loading ? t("auth.saving") : t("auth.continue")}
              loading={loading}
              disabled={!isReady}
            />
          </form>
        </div>
      </div>
    </div>
  );
}
