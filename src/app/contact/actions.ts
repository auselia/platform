"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/marketing/locale";
import { sendContactNotification } from "@/lib/marketing/resend";
import { checkFormGuard } from "@/lib/security/form-guard";
import { verifyTurnstile } from "@/lib/security/turnstile";

// Errors travel as codes (?error=missing|captcha|generic), never as text, so a crafted
// link can't put arbitrary copy on the page. The page maps codes to translated copy.
export async function submitContact(formData: FormData) {
  const lang = await getLocale();

  // Bots (honeypot filled, form submitted too fast or with a forged token) get the normal
  // success page and nothing is stored or sent.
  if (!checkFormGuard(formData)) redirect("/contact/sent");

  if (!(await verifyTurnstile(String(formData.get("cf-turnstile-response") ?? "")))) {
    redirect("/contact?error=captcha");
  }

  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  const email = String(formData.get("email") ?? "").trim().slice(0, 320);
  const orgName = String(formData.get("orgName") ?? "").trim().slice(0, 200);
  const message = String(formData.get("message") ?? "").trim().slice(0, 4000);

  if (!name || !email || !message) redirect("/contact?error=missing");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_contact", {
    p_name: name,
    p_email: email,
    p_org_name: orgName,
    p_message: message,
    p_lang: lang,
  });

  if (error) redirect("/contact?error=generic");
  if (data === "invalid") redirect("/contact?error=missing");
  // Rate-limited: look like success, store nothing, send nothing.
  if (data !== "ok") redirect("/contact/sent");

  try {
    await sendContactNotification({ name, email, orgName, message, lang });
  } catch (err) {
    // The submission is already saved; a notification-email failure is
    // logged, not surfaced to the visitor.
    console.error("Failed to send contact notification email", err);
  }

  // No confirmation email to the submitter: it would let anyone make us send mail to
  // any address they type. The /contact/sent page is the confirmation.
  redirect("/contact/sent");
}
