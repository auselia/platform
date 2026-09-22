"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/marketing/locale";
import { STR } from "@/lib/marketing/i18n";
import { sendContactNotification } from "@/lib/marketing/resend";

export async function submitContact(formData: FormData) {
  const lang = await getLocale();
  const t = STR[lang];

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const orgName = String(formData.get("orgName") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name || !email || !message) {
    redirect(`/contact?error=${encodeURIComponent(t.contactMissingFields)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("contact_submissions").insert({
    name,
    email,
    org_name: orgName,
    message,
    lang,
  });

  if (error) {
    redirect(`/contact?error=${encodeURIComponent(t.contactGenericError)}`);
  }

  try {
    await sendContactNotification({ name, email, orgName, message, lang });
  } catch (err) {
    // The submission is already saved; a notification-email failure is
    // logged, not surfaced to the visitor.
    console.error("Failed to send contact notification email", err);
  }

  redirect("/contact/sent");
}
