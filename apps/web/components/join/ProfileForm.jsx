"use client";

import { joinBySocietyCode, mapSocietyCodeError } from "@parisar/api-client";
import { ChevronDown, LockKeyhole, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useJoinState } from "../../lib/join-state";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

const MAX_FAMILY_MEMBERS = 5;

/**
 * Segmented control (2 options) — web version.
 */
function SegmentedControl({ options, value, onChange }) {
  const { t } = useTranslation("auth");
  return (
    <div className="flex h-11 rounded-xl overflow-hidden border border-[var(--color-neutral-200)]">
      {options.map(({ key, label }, idx) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={[
            "flex-1 flex items-center justify-center text-base font-medium transition-colors",
            idx > 0 ? "border-l border-[var(--color-neutral-200)]" : "",
            value === key ? "text-white" : "text-[var(--color-neutral-600)]",
          ].join(" ")}
          style={{
            backgroundColor: value === key ? "var(--color-brand-500)" : "var(--color-neutral-100)",
          }}
          aria-pressed={value === key}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Section divider with label.
 */
function SectionLabel({ text }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-sm text-[var(--color-neutral-400)] uppercase tracking-wide whitespace-nowrap">
        {text}
      </span>
      <div className="flex-1 h-px bg-[var(--color-neutral-200)]" />
    </div>
  );
}

/**
 * Web Profile Form.
 *
 * Props:
 *   userProfile — { full_name, phone, userId } (pre-filled from server)
 *
 * Reads code, society, structure from Zustand store.
 * On submit: calls joinBySocietyCode, inserts family members, updates store joinResult,
 *   then routes to /join/success or /join/pending.
 */
export default function ProfileForm({ userProfile }) {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const joinStore = useJoinState();
  const { code, society, structure } = joinStore;

  // About you
  const [fullName, setFullName] = useState(userProfile?.full_name ?? "");
  const [residency, setResidency] = useState("owner");
  const [household, setHousehold] = useState("family");

  // Your flat
  const [selectedWingId, setSelectedWingId] = useState("");
  const [selectedFlatId, setSelectedFlatId] = useState("");

  // Emergency contact
  const [emergencyContact, setEmergencyContact] = useState("");

  // Family members
  const [familyExpanded, setFamilyExpanded] = useState(false);
  const [familyMembers, setFamilyMembers] = useState([]);

  // Submit state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const wings = structure?.wings ?? [];
  const allFlats = structure?.flats ?? [];

  // Filter flats by selected wing
  const flatsForWing = selectedWingId ? allFlats.filter((f) => f.wing_id === selectedWingId) : [];

  const canSubmit =
    fullName.trim().length >= 2 &&
    residency &&
    household &&
    selectedWingId &&
    selectedFlatId &&
    !loading;

  function addFamilyMember() {
    if (familyMembers.length >= MAX_FAMILY_MEMBERS) return;
    setFamilyMembers([...familyMembers, { id: Date.now(), name: "", phone: "" }]);
  }

  function updateFamilyMember(id, field, value) {
    setFamilyMembers(familyMembers.map((fm) => (fm.id === id ? { ...fm, [field]: value } : fm)));
  }

  function removeFamilyMember(id) {
    setFamilyMembers(familyMembers.filter((fm) => fm.id !== id));
  }

  // PAR-008 fix: the flat "auth" namespace JSON holds the join.*/setup.* keys that
  // mapSocietyCodeError returns, so t() resolves the namespaced dot-key directly.
  // (Old code referenced an unimported `en` → ReferenceError on every join error.)
  function resolveI18nKey(dotKey) {
    return dotKey ? t(dotKey) : t("auth.networkError");
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!canSubmit) {
      if (fullName.trim().length < 2) {
        setError("Please enter your name (at least 2 characters).");
        return;
      }
      if (!selectedFlatId) {
        setError("Please select your flat.");
        return;
      }
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();

      // 1. Redeem the society code (refreshSession called inside joinBySocietyCode on success)
      const result = await joinBySocietyCode(supabase, {
        code,
        flatId: selectedFlatId,
        residency,
        household,
        emergencyContact: emergencyContact.trim() || null,
      });

      if (result.error) {
        setError(resolveI18nKey(mapSocietyCodeError(result)));
        return;
      }

      // 2. Insert family members (JWT now has society_id from refreshSession)
      const validFamilyMembers = familyMembers.filter((fm) => fm.name.trim().length >= 2);
      if (validFamilyMembers.length > 0) {
        // PAR-106: never discard the {error} — silently dropping family members is
        // data loss on the core join loop. The membership RPC upserts on conflict,
        // so surfacing the failure lets the user safely retry rather than lose rows.
        const { error: familyError } = await supabase.from("family_members").insert(
          validFamilyMembers.map((fm) => ({
            society_id: result.societyId,
            membership_id: result.membershipId,
            full_name: fm.name.trim(),
            phone: fm.phone.trim() || null,
          })),
        );
        if (familyError) {
          setError(t("auth.networkError"));
          return;
        }
      }

      // 3. Update profiles.full_name if changed
      if (userProfile?.userId && fullName.trim() !== (userProfile.full_name ?? "")) {
        // PAR-106: same — a failed name update must not be silently swallowed.
        const { error: nameError } = await supabase
          .from("profiles")
          .update({ full_name: fullName.trim() })
          .eq("user_id", userProfile.userId);
        if (nameError) {
          setError(t("auth.networkError"));
          return;
        }
      }

      // 4. Store join result and navigate
      const flatObj = allFlats.find((f) => f.id === selectedFlatId);
      joinStore.set({
        joinResult: {
          status: result.status,
          flatNumber: flatObj?.number ?? selectedFlatId,
          autoElevatedToCoSecretary: result.autoElevatedToCoSecretary,
          societyName: society?.name ?? "",
        },
      });

      if (result.status === "active") {
        router.push("/join/success");
      } else {
        router.push("/join/pending");
      }
    } catch {
      setError(t("auth.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-[var(--color-neutral-900)]">
          {t("join.profileHeading")}
        </h1>
        <p className="text-base text-[var(--color-neutral-600)]">{t("join.profileSubheading")}</p>
      </div>

      {/* Section: About you */}
      <SectionLabel text={t("join.sectionAboutYou")} />

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="full-name" className="text-sm text-[var(--color-neutral-600)]">
          {t("join.nameLabel")}
        </label>
        <input
          id="full-name"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          maxLength={60}
          placeholder="Full name"
          autoCapitalize="words"
          className="h-12 px-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-base text-[var(--color-neutral-900)] placeholder:text-[var(--color-neutral-400)] outline-none focus:border-[var(--color-brand-700)] focus:ring-2 focus:ring-[var(--color-brand-700)]/20 transition-colors"
        />
      </div>

      {/* Mobile — locked */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-[var(--color-neutral-600)]">Mobile</label>
        <div className="h-12 px-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] flex items-center gap-2">
          <span className="text-base text-[var(--color-neutral-600)] flex-1">
            {userProfile?.phone ?? ""}
          </span>
          <LockKeyhole size={16} color="var(--color-neutral-400)" />
        </div>
        <p className="text-xs text-[var(--color-neutral-400)]">
          {t("setup.step1.secretaryPhoneHelper")}
        </p>
      </div>

      {/* Resident type */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-[var(--color-neutral-600)]">Resident type</span>
        <SegmentedControl
          options={[
            { key: "owner", label: t("join.owner") },
            { key: "tenant", label: t("join.tenant") },
          ]}
          value={residency}
          onChange={setResidency}
        />
      </div>

      {/* Household type */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-[var(--color-neutral-600)]">Household type</span>
        <SegmentedControl
          options={[
            { key: "family", label: t("join.family") },
            { key: "bachelor", label: t("join.bachelor") },
          ]}
          value={household}
          onChange={setHousehold}
        />
      </div>

      {/* Section: Your flat */}
      <SectionLabel text={t("join.sectionYourFlat")} />

      {/* Wing selector */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="wing-select" className="text-sm text-[var(--color-neutral-600)]">
          Wing
        </label>
        <select
          id="wing-select"
          value={selectedWingId}
          onChange={(e) => {
            setSelectedWingId(e.target.value);
            setSelectedFlatId("");
          }}
          className="h-12 px-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-base text-[var(--color-neutral-900)] outline-none focus:border-[var(--color-brand-700)] transition-colors"
        >
          <option value="">{t("join.wingPlaceholder")}</option>
          {wings.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      {/* Flat selector */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="flat-select" className="text-sm text-[var(--color-neutral-600)]">
          Flat
        </label>
        <select
          id="flat-select"
          value={selectedFlatId}
          onChange={(e) => setSelectedFlatId(e.target.value)}
          disabled={!selectedWingId}
          className={[
            "h-12 px-3 rounded-lg border border-[var(--color-neutral-200)] text-base outline-none focus:border-[var(--color-brand-700)] transition-colors",
            selectedWingId
              ? "bg-[var(--color-neutral-0)] text-[var(--color-neutral-900)]"
              : "bg-[var(--color-neutral-100)] text-[var(--color-neutral-400)] cursor-not-allowed",
          ].join(" ")}
        >
          <option value="">
            {selectedWingId
              ? t("join.flatPlaceholder")
              : t("join.wingFirst") || "Select a wing first"}
          </option>
          {flatsForWing.map((f) => (
            <option key={f.id} value={f.id}>
              {f.number}
            </option>
          ))}
        </select>
      </div>

      {/* Emergency contact */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="emergency-contact" className="text-sm text-[var(--color-neutral-600)]">
          {t("join.emergencyContact")}
        </label>
        <input
          id="emergency-contact"
          type="tel"
          value={emergencyContact}
          onChange={(e) => setEmergencyContact(e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="98765 43210"
          className="h-12 px-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-base text-[var(--color-neutral-900)] placeholder:text-[var(--color-neutral-400)] outline-none focus:border-[var(--color-brand-700)] transition-colors"
        />
        <p className="text-xs text-[var(--color-neutral-400)]">{t("join.emergencyHelper")}</p>
      </div>

      {/* Section: Family members */}
      <SectionLabel text={t("join.sectionFamilyMembers")} />

      {/* Family expand toggle */}
      <button
        type="button"
        onClick={() => setFamilyExpanded(!familyExpanded)}
        className="flex items-center gap-2 text-sm text-[var(--color-brand-500)] hover:underline underline-offset-2 self-start"
      >
        <ChevronDown
          size={20}
          color="var(--color-brand-500)"
          className={`transition-transform ${familyExpanded ? "rotate-180" : ""}`}
        />
        {t("join.addFamilyMember")}
      </button>

      {familyExpanded && (
        <div className="flex flex-col gap-3">
          {familyMembers.map((fm) => (
            <div key={fm.id} className="flex gap-2 items-center">
              <input
                type="text"
                value={fm.name}
                onChange={(e) => updateFamilyMember(fm.id, "name", e.target.value)}
                placeholder={t("join.familyNamePlaceholder") || "Name"}
                maxLength={60}
                className="flex-1 h-11 px-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-base text-[var(--color-neutral-900)] placeholder:text-[var(--color-neutral-400)] outline-none focus:border-[var(--color-brand-700)] transition-colors"
              />
              <input
                type="tel"
                value={fm.phone}
                onChange={(e) =>
                  updateFamilyMember(fm.id, "phone", e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                placeholder={t("join.familyPhonePlaceholder") || "Mobile (optional)"}
                className="flex-1 h-11 px-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] text-base text-[var(--color-neutral-900)] placeholder:text-[var(--color-neutral-400)] outline-none focus:border-[var(--color-brand-700)] transition-colors"
              />
              <button
                type="button"
                onClick={() => removeFamilyMember(fm.id)}
                className="p-2 hover:bg-[var(--color-neutral-100)] rounded-lg transition-colors"
                aria-label="Remove family member"
              >
                <Trash2 size={20} color="#c81e1e" />
              </button>
            </div>
          ))}

          {familyMembers.length < MAX_FAMILY_MEMBERS && (
            <button
              type="button"
              onClick={addFamilyMember}
              className="h-11 w-full rounded-xl border border-[var(--color-neutral-200)] flex items-center justify-center gap-2 text-sm text-[var(--color-brand-500)] hover:bg-[var(--color-neutral-50)] transition-colors"
            >
              <UserPlus size={16} color="var(--color-brand-500)" />
              {t("join.addFamilyMember")}
            </button>
          )}

          {familyMembers.length >= MAX_FAMILY_MEMBERS && (
            <p className="text-xs text-[var(--color-neutral-400)] text-center">
              Contact the Secretary to add more family members.
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className={[
          "h-12 w-full rounded-xl font-semibold text-base transition-colors mt-2",
          canSubmit
            ? "text-white hover:opacity-90"
            : "cursor-not-allowed text-[var(--color-neutral-400)]",
        ].join(" ")}
        style={{
          backgroundColor: canSubmit ? "var(--color-brand-500)" : "var(--color-neutral-200)",
        }}
      >
        {loading ? t("join.joining") : t("join.submit")}
      </button>
    </form>
  );
}
