"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { siteUrl } from "@/lib/security/site-url";
import { authErrorCode } from "@/lib/security/auth-errors";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const captchaToken = String(formData.get("cf-turnstile-response") ?? "") || undefined;
  const supabase = await createClient();
  const origin = await siteUrl();

  // Supabase intentionally doesn't error for an unknown email here, to
  // avoid leaking which addresses have accounts.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
    captchaToken,
  });

  if (error) {
    redirect(`/forgot-password?error=${authErrorCode(error)}`);
  }

  redirect("/forgot-password/check-email");
}
