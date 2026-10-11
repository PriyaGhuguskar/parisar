import { Plus, UserPlus } from "lucide-react";
import { secondaryCta } from "./constants";

// Action row — the console's three "make something" actions, together at the
// top right of the content rather than stacked in the sidebar. They are
// page-level actions, not navigation, so they do not belong in the nav list.
// Wraps to its own line on narrow viewports.
export function ActionRow({ isAdmin, onNewSociety }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-end gap-2 px-5 pt-5 lg:px-8 lg:pt-8">
      <button
        type="button"
        onClick={onNewSociety}
        className="a-btn a-shine flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 font-bold text-[14px] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
      >
        <Plus size={16} strokeWidth={2.6} aria-hidden="true" />
        New society
      </button>

      {/* Appointing platform users is admin-only — admin_create_platform_user
          is gated on is_platform_admin(), so a sales user seeing these would
          only ever get NOT_PLATFORM_ADMIN back. Forms land here next; the
          RPCs (create / revoke / list) already exist. */}
      {isAdmin ? (
        <>
          <button type="button" className={secondaryCta}>
            <UserPlus size={15} strokeWidth={2.4} aria-hidden="true" />
            Create staff
          </button>
          <button type="button" className={secondaryCta}>
            <UserPlus size={15} strokeWidth={2.4} aria-hidden="true" />
            Create sales
          </button>
        </>
      ) : null}
    </div>
  );
}
