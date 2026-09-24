import { describe, expect, it } from "vitest";
import { checkFormGuard, issueFormToken } from "./form-guard";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("form guard", () => {
  const t0 = 1_000_000;
  const token = issueFormToken(t0);
  it("accepts a genuine token after the minimum time", () => {
    expect(checkFormGuard(form({ form_token: token }), t0 + 5000)).toBe(true);
  });
  it("rejects too-fast, expired, forged and honeypot submissions", () => {
    expect(checkFormGuard(form({ form_token: token }), t0 + 500)).toBe(false);
    expect(checkFormGuard(form({ form_token: token }), t0 + 7 * 3600 * 1000)).toBe(false);
    expect(checkFormGuard(form({ form_token: `${t0}.deadbeef` }), t0 + 5000)).toBe(false);
    expect(checkFormGuard(form({ form_token: token, website: "http://spam" }), t0 + 5000)).toBe(false);
    expect(checkFormGuard(form({}), t0 + 5000)).toBe(false);
  });
});
