import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { STR } from "@/lib/dashboard/i18n";
import { getLocale } from "@/lib/marketing/locale";
import MarketingHeader from "@/components/marketing/header";
import MarketingFooter from "@/components/marketing/footer";
import Link from "next/link";

// Lands here from the "View invitation" link in the invite email. Not logged in -> bounce
// to login/signup with a `next` back to this same URL, so the accept happens right after.
// Logged in -> call accept_org_invitation() (supabase/migrations/20260923010000_...sql)
// directly and redirect into the dashboard; that RPC is the entire authorization boundary,
// this page just turns its raised exception into friendly copy.
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const lang = await getLocale();
  const t = STR[lang];
  const supabase = await createClient();

  const shell = (body: React.ReactNode) => (
    <div className="brand-surface flex min-h-dvh flex-col overflow-x-hidden bg-bg text-ink">
      <MarketingHeader lang={lang} showPartnerLink={false} />
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center">{body}</div>
      </main>
      <MarketingFooter lang={lang} />
    </div>
  );

  if (!token) {
    return shell(<p className="text-sm text-ink2">{t.acceptInvalid}</p>);
  }

  const { data: { user } } = await supabase.auth.getUser();
  const here = `/accept-invite?token=${encodeURIComponent(token)}`;

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  const { data, error } = await supabase.rpc("accept_org_invitation", { invite_token: token });

  if (!error && data) {
    redirect("/dashboard");
  }

  const msg = error?.message ?? "";
  const friendly = msg.includes("invite_email_mismatch")
    ? t.acceptWrongEmail
    : msg.includes("invite_expired") || msg.includes("invite_not_pending") || msg.includes("invite_not_found")
      ? t.acceptExpired
      : t.acceptGeneric;

  async function signOutAndRetry() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }

  return shell(
    <>
      <p className="text-sm text-ink2">{friendly}</p>
      <div className="mt-5 flex flex-col items-center gap-2">
        {msg.includes("invite_email_mismatch") ? (
          <form action={signOutAndRetry}>
            <button type="submit" className="text-sm text-ink underline">{t.acceptSignOut}</button>
          </form>
        ) : (
          <Link href="/dashboard" className="text-sm text-ink underline">{t.acceptBackToDashboard}</Link>
        )}
      </div>
    </>,
  );
}
