"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/security/safe-next";
import { authErrorCode } from "@/lib/security/auth-errors";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"), "");
  const captchaToken = String(formData.get("cf-turnstile-response") ?? "") || undefined;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });

  if (error) {
    redirect(`/login?error=${authErrorCode(error, "invalid_credentials")}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  redirect(next || "/dashboard");
}
