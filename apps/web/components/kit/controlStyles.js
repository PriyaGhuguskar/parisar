// Shared class strings for kit controls. Plain module (no "use client") so both
// server and client code can import it.
//
// 44px tall (WCAG 2.5.5 target size). The border comes from --input, which clears
// 3:1 on every surface; on focus it thickens to a 2px brand edge that clears it too.

export const CONTROL_CLASS =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive";

// The same treatment for a wrapper around a bare input (PhoneInput).
export const CONTROL_GROUP_CLASS =
  "flex h-11 w-full min-w-0 items-stretch overflow-hidden rounded-lg border border-input bg-card text-[15px] text-foreground transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring has-[:disabled]:bg-muted has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:focus-within:ring-destructive";

export const ICON_BUTTON_CLASS =
  "focus-ring inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50";
