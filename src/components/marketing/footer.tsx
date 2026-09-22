import Link from "next/link";
import { STR, type Lang } from "@/lib/marketing/i18n";

export default function MarketingFooter({ lang }: { lang: Lang }) {
  const t = STR[lang];
  const year = new Date().getFullYear();
  return (
    <footer className="relative z-10 mx-auto w-full max-w-5xl px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-ink2">
        <span>
          &copy; {year} Auselia. {t.footerRights}
        </span>
        <nav className="flex flex-wrap items-center gap-4">
          <Link href="/contact" className="hover:text-ink">
            {t.footerContact}
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            {t.footerPrivacy}
          </Link>
          <Link href="/terms" className="hover:text-ink">
            {t.footerTerms}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
