import { createHmac, timingSafeEqual } from "node:crypto";

// Cheap bot filter for public forms: a signed timestamp rendered into the form, plus a
// honeypot field. A submission is only accepted if the token is genuine and the form
// was open for at least MIN_MS (and no more than MAX_MS).
const MIN_MS = 2500;
const MAX_MS = 6 * 3600 * 1000;

function secret() {
  return process.env.FORM_GUARD_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev-only-form-guard";
}
const sign = (ts: string) => createHmac("sha256", secret()).update(ts).digest("hex");

export function issueFormToken(now = Date.now()): string {
  const ts = String(now);
  return `${ts}.${sign(ts)}`;
}

export function checkFormGuard(formData: FormData, now = Date.now()): boolean {
  if (String(formData.get("website") ?? "") !== "") return false; // honeypot
  const token = String(formData.get("form_token") ?? "");
  const [ts, mac] = token.split(".");
  if (!ts || !mac || !/^\d+$/.test(ts)) return false;
  const a = Buffer.from(mac), b = Buffer.from(sign(ts));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const age = now - Number(ts);
  return age >= MIN_MS && age <= MAX_MS;
}
