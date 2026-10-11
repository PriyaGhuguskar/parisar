// Console navigation: the desktop sidebar and the mobile section switcher.

import { ChevronRight, LogOut } from "lucide-react";
import Image from "next/image";
import { NAV } from "./constants";

export function Sidebar({
  isAdmin,
  section,
  inRequests,
  requestsOpen,
  setRequestsOpen,
  leads,
  onSelect,
}) {
  return (
    <aside
      className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-[var(--color-neutral-200)] lg:flex"
      style={{ background: "linear-gradient(180deg, #fff, var(--color-neutral-50))" }}
    >
      <div className="flex h-[68px] items-center gap-2.5 px-5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-[11px] shadow-[0_4px_10px_-3px_rgba(18,113,90,.5)]"
          style={{
            color: "#fff",
          }}
        >
          <Image
            src="/parisar-mark-96.png"
            alt=""
            aria-hidden="true"
            width={34}
            height={34}
            className="h-full w-full object-contain"
          />
        </span>
        <span className="text-[17px] font-extrabold tracking-[-0.03em] text-[var(--color-neutral-900)]">
          Parisar
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.06em]"
          style={
            isAdmin
              ? { backgroundColor: "var(--color-brand-50)", color: "var(--color-brand-700)" }
              : { backgroundColor: "#E7F0FB", color: "#1F5FA0" }
          }
        >
          {isAdmin ? "ADMIN" : "SALES"}
        </span>
      </div>

      <p className="px-5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--color-neutral-400)]">
        Manage
      </p>
      <nav className="a-stagger flex flex-1 flex-col gap-0.5 px-3">
        {NAV.filter((n) => isAdmin || !n.adminOnly).map(({ id, label, icon: Icon, group, sub }) => {
          const on = section === id;

          // A group header names the pair below it; it is not a destination,
          // so it must not be a button — a control that looks focusable but
          // does nothing is worse than plain text for keyboard and SR users.
          if (group) {
            const expanded = requestsOpen || inRequests;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setRequestsOpen((v) => !v)}
                aria-expanded={expanded}
                className="mt-3 flex items-center gap-3 rounded-xl py-2 pr-3 pl-2 text-left font-semibold text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]"
                style={{ color: "var(--color-neutral-600)" }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: "var(--color-neutral-100)",
                    color: "var(--color-neutral-600)",
                  }}
                >
                  <Icon size={16} strokeWidth={2.2} />
                </span>
                {label}
                {leads.length > 0 ? (
                  <span
                    className="ml-auto rounded-full px-1.5 py-0.5 font-bold text-[11px] tabular-nums"
                    style={{ backgroundColor: "#FDF0DF", color: "#8A4708" }}
                  >
                    {leads.length}
                  </span>
                ) : null}
                <ChevronRight
                  size={15}
                  strokeWidth={2.4}
                  aria-hidden="true"
                  className={`${leads.length > 0 ? "" : "ml-auto"} transition-transform duration-200`}
                  style={{ transform: expanded ? "rotate(90deg)" : "none" }}
                />
              </button>
            );
          }

          // Collapsed: the two queues are not rendered at all, so they are out
          // of the tab order too — hiding them visually alone would leave a
          // keyboard user tabbing into links they cannot see.
          if (sub && !(requestsOpen || inRequests)) return null;

          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={on ? "page" : undefined}
              className={`a-nav group/nav relative flex items-center gap-3 rounded-xl py-2 pr-3 text-left font-semibold text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] ${sub ? "ml-5 pl-2" : "pl-2"}`}
              style={{
                backgroundColor: on ? "var(--color-brand-50)" : "transparent",
                color: on ? "var(--color-brand-700)" : "var(--color-neutral-600)",
              }}
            >
              {/* Accent bar — grows in when active. */}
              <span
                aria-hidden="true"
                className="absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-200"
                style={{
                  height: on ? "20px" : "0px",
                  backgroundColor: "var(--color-brand-500)",
                }}
              />
              {/* Icon in a well that fills when active. */}
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200"
                style={{
                  backgroundColor: on ? "var(--color-brand-500)" : "var(--color-neutral-100)",
                  color: on ? "#fff" : "var(--color-neutral-600)",
                }}
              >
                <Icon size={16} strokeWidth={2.2} />
              </span>
              {label}
            </button>
          );
        })}
      </nav>

      <a
        href="/dashboard"
        className="group/leave m-3 flex items-center gap-2.5 rounded-xl border border-[var(--color-neutral-200)] bg-white px-3 py-2.5 text-[13px] font-semibold text-[var(--color-neutral-600)] transition-colors hover:border-[var(--color-brand-500)] hover:text-[var(--color-brand-700)]"
      >
        <LogOut
          size={15}
          strokeWidth={2.2}
          aria-hidden="true"
          className="transition-transform group-hover/leave:-translate-x-0.5"
        />
        Leave staff view
      </a>
    </aside>
  );
}

export function MobileSectionNav({ isAdmin, section, onSelect }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-neutral-200)] bg-white p-2 lg:hidden">
      {/* Skip the Requests group header: on desktop it is a disclosure that
              reveals two queues, but here every chip IS a section, and there is
              no "requests" section to render — tapping it would blank the page.
              Its two children appear as their own chips instead. */}
      {NAV.filter((n) => !n.group && (isAdmin || !n.adminOnly)).map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className="shrink-0 rounded-full px-3.5 py-2 font-bold text-[13px]"
          style={{
            backgroundColor: section === id ? "var(--color-brand-500)" : "transparent",
            color: section === id ? "#fff" : "var(--color-neutral-600)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
