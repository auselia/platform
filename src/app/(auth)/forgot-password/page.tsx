import TurnstileWidget from "@/components/turnstile-widget";
import { authErrorMessage } from "@/lib/security/auth-errors";
import { requestPasswordReset } from "./actions";
import Link from "next/link";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <>
      <p className="text-sm text-ink2">We&apos;ll email you a reset link.</p>

      {authErrorMessage(error) && (
        <p className="mt-4 rounded-lg border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-ink">
          {authErrorMessage(error)}
        </p>
      )}

      <form action={requestPasswordReset} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-mono font-medium uppercase tracking-wide text-ink2">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </div>
        <TurnstileWidget />
        <button
          type="submit"
          className="mt-2 rounded-lg bg-amber px-4 py-2 text-sm font-semibold text-forest"
        >
          Send reset link
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink2">
        <Link href="/login" className="text-ink underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
