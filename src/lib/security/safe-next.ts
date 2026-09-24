// Only ever returns a same-origin path. Anything else (absolute URLs, `//host`,
// `/\host`, `@host` tricks, control characters) falls back.
export function safeNext(raw: unknown, fallback = "/dashboard"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (/[\\@\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const u = new URL(raw, "http://internal.invalid");
    if (u.origin !== "http://internal.invalid") return fallback;
  } catch {
    return fallback;
  }
  return raw;
}
