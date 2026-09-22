"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { LOCALE_COOKIE } from "./locale";
import type { Lang } from "./i18n";

// Server Actions are reachable directly as public POST endpoints, so this
// can't trust the client to only ever send "en" or "es".
export async function setLocale(lang: Lang) {
  if (lang !== "en" && lang !== "es") return;
  (await cookies()).set(LOCALE_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  refresh();
}
