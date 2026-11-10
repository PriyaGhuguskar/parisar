// Client-side file checks: fast feedback only. A browser reports whatever type the
// file name implies, so anything stored must be validated again server-side or by
// the storage bucket's own type and size limits.

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

function matchesAccept(file, token) {
  const rule = token.trim().toLowerCase();
  if (rule.startsWith(".")) return file.name.toLowerCase().endsWith(rule);
  const type = String(file.type || "").toLowerCase();
  if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
  return type === rule;
}

/**
 * ".pdf" -> "PDF", "image/*" -> "IMAGE", "application/pdf" -> "PDF".
 *
 * @param {string[]} accept
 * @returns {string}
 */
export function describeAccept(accept = []) {
  const names = accept.map((token) => {
    const rule = token.trim();
    if (rule.startsWith(".")) return rule.slice(1).toUpperCase();
    const [kind, sub] = rule.split("/");
    return (sub === "*" ? kind : sub).toUpperCase();
  });
  return [...new Set(names)].join(", ");
}

/**
 * @param {{ name: string, size: number, type?: string }} file
 * @param {{ accept?: string[], maxBytes?: number }} [rules]
 * @returns {null | { code: "empty" | "type" | "size" }}
 */
export function validateFile(file, { accept = [], maxBytes } = {}) {
  if (file.size === 0) return { code: "empty" };
  if (accept.length > 0 && !accept.some((token) => matchesAccept(file, token))) {
    return { code: "type" };
  }
  if (maxBytes !== undefined && file.size > maxBytes) return { code: "size" };
  return null;
}
