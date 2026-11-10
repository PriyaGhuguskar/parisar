// Page-level UI kit, layered on the shadcn primitives in components/ui.
//
// components/ui  = element primitives (button, input, dialog…)
// components/kit = PAGE primitives (header, empty state, stat, surface…) and the
//                  form and data components the onboarding flows are built from.
//
// The kit exists because 39 screens were each inventing their own header
// sizing, padding, empty state and loading treatment. Everything here reads
// from the tokens in app/tokens.css. Reference: docs/onboarding/DESIGN.md.

export { DestructiveConfirmDialog } from "../shared/DestructiveConfirmDialog";
export { ConfirmDialog } from "./ConfirmDialog";
export { CopyButton } from "./CopyButton";
export { CONTROL_CLASS } from "./controlStyles";
export { DataTable } from "./DataTable";
export { DatePicker } from "./DatePicker";
export { EmptyState } from "./EmptyState";
export { ErrorState } from "./ErrorState";
export { FileUpload } from "./FileUpload";
export { FormActions } from "./FormActions";
export { FormField } from "./FormField";
export { ListSkeleton } from "./ListSkeleton";
export { LoadingState } from "./LoadingState";
export { formatDateValue, parseDateValue, toDateValue } from "./lib/dateValue";
export { describeAccept, formatBytes, validateFile } from "./lib/fileValidation";
export { isValidIndianMobile, normalizeIndianMobile, toE164 } from "./lib/phone";
export { STATUS_TONES, STATUS_VALUES, statusTone } from "./lib/statuses";
export { MetricCard } from "./MetricCard";
export { Notice } from "./Notice";
export { PageHeader } from "./PageHeader";
export { PageShell } from "./PageShell";
export { PhoneInput } from "./PhoneInput";
export { SearchableSelect } from "./SearchableSelect";
export { StatCard } from "./StatCard";
export { StatusBadge } from "./StatusBadge";
export { StatusPill } from "./StatusPill";
export { Stepper } from "./Stepper";
export { SurfaceCard } from "./SurfaceCard";
export { TextArea, TextInput } from "./TextInput";
