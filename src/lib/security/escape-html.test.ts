import { describe, expect, it } from "vitest";
import { escapeHtml, singleLine } from "./escape-html";

describe("escapeHtml", () => {
  it("neutralises markup and quotes", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;");
  });
});
describe("singleLine", () => {
  it("removes line breaks", () => {
    expect(singleLine("a\r\nBcc: x\nb")).toBe("a Bcc: x b");
  });
});
