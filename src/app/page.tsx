import type { Metadata } from "next";
import Link from "next/link";
import PlantMark from "@/components/plant-mark";
import MarketingHeader from "@/components/marketing/header";
import MarketingFooter from "@/components/marketing/footer";
import { STR } from "@/lib/marketing/i18n";
import { getLocale } from "@/lib/marketing/locale";

export async function generateMetadata(): Promise<Metadata> {
  const t = STR[await getLocale()];
  return { title: t.metaHomeTitle, description: t.metaHomeDescription };
}

export default async function Home() {
  const lang = await getLocale();
  const t = STR[lang];

  return (
    <div className="brand-surface flex min-h-dvh flex-col overflow-x-hidden bg-bg text-ink">
      <MarketingHeader lang={lang} />

      <main className="relative z-10 flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start px-6 pb-12 pt-4 sm:pt-10">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-ink2">
            {t.heroKicker}
          </span>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {t.heroTitle}
          </h1>
          <p className="mt-5 max-w-xl text-base text-ink2 sm:text-lg">
            {t.heroBodyPre}
            <span className="font-semibold text-accent">Hope</span>
            {t.heroBodyPost}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/demo"
              className="rounded-lg bg-amber px-5 py-2.5 text-sm font-semibold text-forest"
            >
              {t.ctaDemo}
            </Link>
            <Link
              href="/contact"
              className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-ink"
            >
              {t.ctaContact}
            </Link>
          </div>

          <p className="mt-10 font-mono sm:mt-16 text-xs uppercase tracking-[0.14em] text-ink2">
            {t.heroTagline}
          </p>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 mx-auto flex max-w-5xl w-full justify-end px-6">
          <PlantMark className="block h-24 w-24 text-ink2 opacity-30 sm:h-56 sm:w-56 sm:opacity-80" />
        </div>
      </main>

      <MarketingFooter lang={lang} />
    </div>
  );
}
