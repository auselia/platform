// Shared transactional-email transport, used by both the public marketing site
// (contact form) and the dashboard (org invites). Plain fetch, no SDK dependency.
export async function send(payload: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Resend is not configured (missing RESEND_API_KEY)");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Auselia <no-reply@auselia.cl>",
      to: payload.to,
      reply_to: payload.replyTo,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
  }
}
