// Consistent page frame: measure, gutters and vertical rhythm.
//
// Before this, every screen set its own padding and max-width, so the app drifted
// a few pixels per page. One shell means the whole product breathes the same way.
export function PageShell({ children, className = "", width = "default" }) {
  const max = width === "wide" ? "max-w-6xl" : width === "narrow" ? "max-w-2xl" : "max-w-4xl";
  return (
    <div className={`mx-auto w-full ${max} px-4 py-6 sm:px-6 sm:py-8 ${className}`}>{children}</div>
  );
}
