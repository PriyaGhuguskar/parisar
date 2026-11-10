// PIN rules and error copy for /verify, moved out of the page unchanged.

export const PIN_FIELD =
  "h-14 w-full rounded-2xl border bg-(--color-neutral-0) px-4 text-center text-[24px] font-bold tracking-[0.5em] outline-none transition-[border-color,box-shadow] duration-150 placeholder:tracking-[0.35em] placeholder:text-neutral-400 focus:border-(--color-brand-500) focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_18%,transparent)]";

export function weakPin(p) {
  return p === "1234" || /^(\d)\1{3}$/.test(p); // 1234 or four identical
}

/** [i18n key, options] for a pinLogin error. */
export function pinLoginErrorKey(res) {
  switch (res?.error) {
    case "PIN_INVALID":
    case "INVALID_INPUT":
      return ["auth.pinWrong"];
    case "LOCKED":
      return [
        "auth.pinLocked",
        {
          minutes: String(Math.max(1, Math.ceil((res.retryAfterSeconds ?? 900) / 60))),
          defaultValue: "Too many wrong PINs. Try again in {{minutes}} minutes.",
        },
      ];
    case "RATE_LIMITED":
      return ["auth.rateLimited"];
    default:
      return ["auth.networkError"];
  }
}

/** [i18n key, options] for a setMyPin error. */
export function setPinErrorKey(res) {
  switch (res?.error) {
    case "WEAK_PIN":
      return ["auth.setPinWeak"];
    case "INVALID_PIN":
      return ["auth.pinWrong"];
    case "REAUTH_REQUIRED":
    case "AUTH_REQUIRED":
      return [
        "auth.reauthRequired",
        { defaultValue: "For your security, please verify your number again." },
      ];
    default:
      return ["auth.networkError"];
  }
}
