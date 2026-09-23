import { send } from "@/lib/email/resend";
import { STR, fill, type Lang, type Strings } from "./i18n";

// Kept simple on purpose: a logo, one sentence naming who invited them and to which
// org, one button. Inline styles only - no external CSS, for email-client safety.
function renderInviteHtml(input: { orgName: string; inviterEmail: string; roleLabel: string; acceptUrl: string }, t: Strings) {
  const intro = fill(t.inviteEmailIntroText, { inviter: input.inviterEmail, org: input.orgName, role: input.roleLabel });
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px; color: #1a1a1a;">
      <img src="https://auselia.com/apple-icon.png" width="40" height="40" alt="Auselia" style="display: block; margin-bottom: 24px; border-radius: 8px;" />
      <p style="font-size: 15px; line-height: 1.6;">${intro}</p>
      <p style="margin: 28px 0;">
        <a href="${input.acceptUrl}" style="display: inline-block; background: #d99e39; color: #14261c; font-weight: 600; font-size: 14px; padding: 10px 20px; border-radius: 8px; text-decoration: none;">${t.inviteEmailButton}</a>
      </p>
      <p style="font-size: 12px; color: #6b6b6b; line-height: 1.5;">${t.inviteEmailFooter}</p>
    </div>
  `.trim();
}

export async function sendOrgInvite(input: {
  to: string;
  orgName: string;
  inviterEmail: string;
  role: "editor" | "viewer";
  acceptUrl: string;
  lang: Lang;
}) {
  const t = STR[input.lang];
  const roleLabel = input.role === "editor" ? t.shareRoleEditor : t.shareRoleViewer;

  await send({
    to: [input.to],
    subject: fill(t.inviteEmailSubject, { org: input.orgName, inviter: input.inviterEmail }),
    text: `${fill(t.inviteEmailIntroText, { inviter: input.inviterEmail, org: input.orgName, role: roleLabel })}\n\n${input.acceptUrl}`,
    html: renderInviteHtml({ orgName: input.orgName, inviterEmail: input.inviterEmail, roleLabel, acceptUrl: input.acceptUrl }, t),
  });
}
