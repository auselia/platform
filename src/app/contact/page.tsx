import type { Metadata } from "next";
import MarketingHeader from "@/components/marketing/header";
import MarketingFooter from "@/components/marketing/footer";
import { STR } from "@/lib/marketing/i18n";
import { getLocale } from "@/lib/marketing/locale";
import TurnstileWidget from "@/components/turnstile-widget";
import { issueFormToken } from "@/lib/security/form-guard";
import { submitContact } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = STR[await getLocale()];
  return { title: t.metaContactTitle, description: t.metaContactDescription };
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const lang = await getLocale();
  const t = STR[lang];
  const { error } = await searchParams;
  const errorText =
    error === "missing" ? t.contactMissingFields
    : error === "captcha" ? t.contactCaptchaError
    : error ? t.contactGenericError
    : null;

  return (
    <div className="brand-surface flex min-h-dvh flex-col overflow-x-hidden bg-bg text-ink">
      <MarketingHeader lang={lang} />

      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col px-6 pb-12 pt-6 sm:pt-12">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          {t.contactTitle}
        </h1>
        <p className="mt-3 text-sm text-ink2">{t.contactSubtitle}</p>

        {errorText && (
          <p className="mt-5 rounded-lg border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-ink">
            {errorText}
          </p>
        )}

        <form action={submitContact} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="form_token" value={issueFormToken()} />
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="website">Website</label>
            <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-xs font-mono font-medium uppercase tracking-wide text-ink2">
              {t.contactName}
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-mono font-medium uppercase tracking-wide text-ink2">
              {t.contactEmail}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="orgName" className="text-xs font-mono font-medium uppercase tracking-wide text-ink2">
              {t.contactOrg}
            </label>
            <input
              id="orgName"
              name="orgName"
              type="text"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="message" className="text-xs font-mono font-medium uppercase tracking-wide text-ink2">
              {t.contactMessage}
            </label>
            <textarea
              id="message"
              name="message"
              required
              rows={5}
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
          <TurnstileWidget />
          <button
            type="submit"
            className="mt-2 rounded-lg bg-amber px-5 py-2.5 text-sm font-semibold text-forest"
          >
            {t.contactSubmit}
          </button>
        </form>
      </main>

      <MarketingFooter lang={lang} />
    </div>
  );
}
