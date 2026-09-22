import { cookies, headers } from "next/headers";
import type { Lang } from "./i18n";

// Manual language choice always wins once set; see locale-actions.ts.
export const LOCALE_COOKIE = "auselia-locale";

// Domain default: .cl -> Spanish, everything else (.com, localhost, previews)
// -> English. Pure so it's unit-testable without a real request.
export function localeFromHost(host: string | null | undefined): Lang {
  const h = (host ?? "").toLowerCase();
  return /\.cl(:\d+)?$/.test(h) ? "es" : "en";
}

export async function getLocale(): Promise<Lang> {
  const cookieLang = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (cookieLang === "en" || cookieLang === "es") return cookieLang;
  return localeFromHost((await headers()).get("host"));
}
