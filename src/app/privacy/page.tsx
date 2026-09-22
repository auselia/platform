import type { Metadata } from "next";
import MarketingHeader from "@/components/marketing/header";
import MarketingFooter from "@/components/marketing/footer";
import LegalDocView from "@/components/marketing/legal-doc";
import { STR } from "@/lib/marketing/i18n";
import { PRIVACY } from "@/lib/marketing/legal-content";
import { getLocale } from "@/lib/marketing/locale";

export async function generateMetadata(): Promise<Metadata> {
  const t = STR[await getLocale()];
  return { title: t.metaPrivacyTitle, description: t.metaPrivacyDescription };
}

export default async function PrivacyPage() {
  const lang = await getLocale();

  return (
    <div className="brand-surface flex min-h-dvh flex-col overflow-x-hidden bg-bg text-ink">
      <MarketingHeader lang={lang} />
      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-12 pt-6 sm:pt-12">
        <LegalDocView doc={PRIVACY[lang]} />
      </main>
      <MarketingFooter lang={lang} />
    </div>
  );
}
