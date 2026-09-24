"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { authErrorCode } from "@/lib/security/auth-errors";

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (password.length < 10) redirect("/reset-password?error=weak_password");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/reset-password?error=${authErrorCode(error)}`);
  }

  redirect("/dashboard");
}
