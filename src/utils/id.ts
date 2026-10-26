/** Generates a prefixed unique id using the Web Crypto API (available in
 * browsers and in Node >= 19, including under Vitest). */
export function generateId(prefix: string): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : fallbackUuid();
  return `${prefix}-${uuid}`;
}

function fallbackUuid(): string {
  // Extremely unlikely fallback path; keeps the module usable in
  // environments without crypto.randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
