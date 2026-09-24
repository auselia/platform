import { describe, expect, it } from "vitest";
import { config } from "./proxy";

// Same matching Next.js applies: each matcher is a path-to-regexp pattern.
const matches = (path: string) =>
  config.matcher.some((m) => new RegExp("^" + m.replace(/\/:path\*$/, "(?:/.*)?") + "$").test(path));

describe("proxy matcher", () => {
  it("runs only where the session is needed", () => {
    for (const p of ["/dashboard", "/dashboard/x", "/reset-password", "/accept-invite"]) expect(matches(p)).toBe(true);
  });
  it("skips public pages", () => {
    for (const p of ["/", "/demo", "/contact", "/login", "/signup", "/privacy", "/terms", "/auth/callback"]) expect(matches(p)).toBe(false);
  });
});
