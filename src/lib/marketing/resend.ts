import type { Lang } from "./i18n";

// Best-effort notification for a contact-form submission. The database row
// (see app/contact/actions.ts) is the source of truth; a Resend failure here
// is caught by the caller and never blocks the visitor's success page.
export async function sendContactNotification(input: {
  name: string;
  email: string;
  orgName: string;
  message: string;
  lang: Lang;
}) {
  const to = process.env.CONTACT_NOTIFICATION_TO;
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !apiKey) {
    throw new Error("Resend is not configured (missing RESEND_API_KEY or CONTACT_NOTIFICATION_TO)");
  }

  const subject = `New contact message from ${input.name}`;
  const text = [
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    input.orgName ? `Organization: ${input.orgName}` : null,
    `Language: ${input.lang}`,
    "",
    input.message,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Auselia <no-reply@auselia.cl>",
      to: [to],
      reply_to: input.email,
      subject,
      text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
  }
}
