"use client";

// The console's right-hand drawer, shared by the society and request details.
// Escape and the scrim close it. While a dialog or popover is open on top, Escape
// belongs to that layer, so the drawer leaves it alone.

import { useEffect } from "react";

const OVERLAY_SELECTOR = '[data-slot="dialog-content"], [data-slot="popover-content"]';

export function Drawer({ label, onClose, width = "max-w-[1100px] lg:w-[88vw]", children }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={onClose}
        className="a-scrim fixed inset-0 z-40 bg-[rgba(18,38,28,.42)] backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`a-drawer fixed right-0 top-0 z-50 h-full w-full ${width} border-l border-border bg-card shadow-overlay`}
      >
        {children}
      </div>
    </>
  );
}
