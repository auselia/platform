import { signup } from "./actions";
import Link from "next/link";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <>
      <p className="text-sm text-ink2">Create your workspace.</p>

      {error && (
        <p className="mt-4 rounded-lg border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-ink">
          {error}
        </p>
      )}

      <form action={signup} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="orgName" className="text-xs font-mono font-medium uppercase tracking-wide text-ink2">
            Organization name
          </label>
          <input
            id="orgName"
            name="orgName"
            type="text"
            placeholder="Your organization name"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </div>
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs font-mono font-medium uppercase tracking-wide text-ink2">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </div>
        <button
          type="submit"
          className="mt-2 rounded-lg bg-amber px-4 py-2 text-sm font-semibold text-forest"
        >
          Create account
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink2">
        Already have an account?{" "}
        <Link href="/login" className="text-ink underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
