// One shape for every console call: { data } on success, { error: CODE } on an
// expected failure, { error: "generic" } when the wrapper threw (network, deploy).
// Screens translate the code with errorText and never show a raw message.

export async function settle(call) {
  try {
    const result = await call();
    if (result && typeof result === "object" && !Array.isArray(result) && result.error) {
      return { error: String(result.error) };
    }
    return { data: result };
  } catch {
    return { error: "generic" };
  }
}

/** Translated message for a code from settle(), falling back to the generic one. */
export function errorText(t, code) {
  const generic = t("errors.generic");
  if (!code || code === "generic") return generic;
  return t(`errors.${code}`, { defaultValue: generic });
}
