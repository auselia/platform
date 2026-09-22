import MarketingHeader from "@/components/marketing/header";
import MarketingFooter from "@/components/marketing/footer";
import { getLocale } from "@/lib/marketing/locale";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLocale();

  return (
    <div className="brand-surface flex min-h-dvh flex-col overflow-x-hidden bg-bg text-ink">
      <MarketingHeader lang={lang} showPartnerLink={false} />

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">{children}</div>
      </main>

      <MarketingFooter lang={lang} />
    </div>
  );
}
