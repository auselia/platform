import Link from "next/link";
import ThemeToggle from "@/components/theme-toggle";
import Wordmark from "@/components/wordmark";
import LanguageSwitcher from "./language-switcher";
import { STR, type Lang } from "@/lib/marketing/i18n";

export default function MarketingHeader({ lang }: { lang: Lang }) {
  const t = STR[lang];
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6">
      <Link href="/">
        <Wordmark size={28} />
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <LanguageSwitcher lang={lang} />
        <ThemeToggle />
        <Link
          href="/login"
          className="rounded-full border border-border px-4 py-1.5 text-xs font-mono uppercase tracking-wide text-ink2"
        >
          {t.navPartnerSignIn}
        </Link>
      </div>
    </div>
  );
}
