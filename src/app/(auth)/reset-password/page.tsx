import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { updatePassword } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=Use the link from your password reset email");

  return (
    <>
      <p className="text-sm text-ink2">Choose a new password.</p>

      {error && (
        <p className="mt-4 rounded-lg border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-ink">
          {error}
        </p>
      )}

      <form action={updatePassword} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs font-mono font-medium uppercase tracking-wide text-ink2">
            New password
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
          Update password
        </button>
      </form>
    </>
  );
}
