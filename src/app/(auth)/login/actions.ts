"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  // Guard against an open redirect via a crafted `next` - only ever a same-origin path.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}
