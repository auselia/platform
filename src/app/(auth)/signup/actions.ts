"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { siteUrl } from "@/lib/security/site-url";
import { safeNext } from "@/lib/security/safe-next";
import { authErrorCode } from "@/lib/security/auth-errors";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const orgName = String(formData.get("orgName") ?? "").trim().slice(0, 200);
  const next = safeNext(formData.get("next"), "");
  const captchaToken = String(formData.get("cf-turnstile-response") ?? "") || undefined;
  const nextQuery = next ? `&next=${encodeURIComponent(next)}` : "";

  if (password.length < 10) redirect(`/signup?error=weak_password${nextQuery}`);

  const supabase = await createClient();
  const origin = await siteUrl();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      captchaToken,
      ...(next ? { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` } : {}),
    },
  });

  if (error) {
    redirect(`/signup?error=${authErrorCode(error, "signup_failed")}${nextQuery}`);
  }

  // No session yet means this project requires email confirmation - there's
  // no authenticated request to safely create their org from yet. The
  // confirmation link (emailRedirectTo above, when there's a next to honor)
  // carries them to /auth/callback -> next itself; otherwise the dashboard
  // page handles "logged in but no org" as an onboarding step on first login.
  if (!data.session) {
    redirect("/signup/check-email");
  }

  // See dashboard/actions.ts's createOrganization for why this skips
  // .select() on the insert: no membership exists yet, so RLS would reject
  // reading the row back and roll back the whole insert.
  const orgId = crypto.randomUUID();

  const { error: orgError } = await supabase
    .from("organizations")
    .insert({ id: orgId, name: orgName || `${email}'s workspace` });

  if (orgError) {
    console.error("signup: org insert failed", orgError);
    redirect("/signup?error=generic");
  }

  const { error: memberError } = await supabase.from("memberships").insert({
    user_id: data.session!.user.id,
    org_id: orgId,
    role: "owner",
  });

  if (memberError) {
    console.error("signup: membership insert failed", memberError);
    redirect("/signup?error=generic");
  }

  redirect(next || "/dashboard");
}
