import type { Lang } from "./i18n";
import { STR } from "./i18n";
import { send } from "@/lib/email/resend";

// Notification for us, sent to CONTACT_NOTIFICATION_TO. The database row
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
  if (!to) throw new Error("Resend is not configured (missing CONTACT_NOTIFICATION_TO)");

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

  await send({
    to: [to],
    replyTo: input.email,
    subject: `New contact message from ${input.name}`,
    text,
  });
}

// A short confirmation sent back to the visitor, so they know their message
// went through and roughly what to expect next. Independent of, and no more
// critical than, the notification above: a failure here is also caught by
// the caller and never blocks the visitor's success page.
export async function sendContactConfirmation(input: { name: string; email: string; lang: Lang }) {
  const t = STR[input.lang];
  await send({
    to: [input.email],
    subject: t.contactConfirmSubject,
    text: t.contactConfirmBody,
  });
}
