// Page-level UI kit, layered on the shadcn primitives in components/ui.
//
// components/ui  = element primitives (button, input, dialog…)
// components/kit = PAGE primitives (header, empty state, stat, surface…)
//
// The kit exists because 39 screens were each inventing their own header
// sizing, padding, empty state and loading treatment. Everything here reads
// from the Society Green tokens and the motion classes in globals.css.
export { EmptyState } from "./EmptyState";
export { ListSkeleton } from "./ListSkeleton";
export { PageHeader } from "./PageHeader";
export { PageShell } from "./PageShell";
export { StatCard } from "./StatCard";
export { StatusPill } from "./StatusPill";
export { SurfaceCard } from "./SurfaceCard";
