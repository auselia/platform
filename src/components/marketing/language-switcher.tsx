"use client";

import { useTransition } from "react";
import type { Lang } from "@/lib/marketing/i18n";
import { setLocale } from "@/lib/marketing/locale-actions";

// Setting the cookie inside the Server Action re-renders every server
// component on this page with the new value (Next's documented behavior for
// cookie writes inside a Server Action), so there's no client-side refresh
// call or navigation needed here.
export default function LanguageSwitcher({ lang }: { lang: Lang }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="Language"
      value={lang}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as Lang;
        startTransition(() => {
          void setLocale(next);
        });
      }}
      className="rounded-full border border-border bg-transparent px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-ink2 outline-none disabled:opacity-60"
    >
      <option value="en">🇺🇸 EN</option>
      <option value="es">🇨🇱 ES</option>
    </select>
  );
}
