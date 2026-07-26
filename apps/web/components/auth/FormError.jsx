// Inline error message — danger.500, 14px, role="alert" for screen readers.
// Props: message (string | null | undefined)

export default function FormError({ message }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-[var(--color-danger)] leading-snug">
      {message}
    </p>
  );
}
