import Link from "next/link";
import MarketingHeader from "@/components/marketing/header";
import MarketingFooter from "@/components/marketing/footer";
import { STR } from "@/lib/marketing/i18n";
import { getLocale } from "@/lib/marketing/locale";

export default async function ContactSentPage() {
  const lang = await getLocale();
  const t = STR[lang];

  return (
    <div className="brand-surface flex min-h-dvh flex-col overflow-x-hidden bg-bg text-ink">
      <MarketingHeader lang={lang} />

      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col px-6 pb-12 pt-6 sm:pt-12">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          {t.contactSentTitle}
        </h1>
        <p className="mt-3 text-sm text-ink2">{t.contactSentBody}</p>
        <Link href="/" className="mt-6 text-sm font-medium text-accent underline">
          {t.backHome}
        </Link>
      </main>

      <MarketingFooter lang={lang} />
    </div>
  );
}
