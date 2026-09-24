import { describe, expect, it, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/email/resend", () => ({ send }));

import { sendOrgInvite } from "./email";

describe("sendOrgInvite", () => {
  it("escapes the org name in HTML and keeps the subject on one line", async () => {
    await sendOrgInvite({
      to: "a@b.co",
      orgName: `<a href="https://evil.test">Log in</a>\nBcc: x`,
      inviterEmail: "o@x.co",
      role: "viewer",
      acceptUrl: "https://auselia.com/accept-invite?token=1",
      lang: "en",
    });
    const payload = send.mock.calls[0][0];
    expect(payload.html).not.toContain("<a href=\"https://evil.test\"");
    expect(payload.html).toContain("&lt;a href=&quot;https://evil.test&quot;&gt;");
    expect(payload.subject).not.toMatch(/[\r\n]/);
  });
});
