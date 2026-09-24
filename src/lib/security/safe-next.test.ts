import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/accept-invite?token=abc-123")).toBe("/accept-invite?token=abc-123");
  });
  it.each(["@evil.com", "//evil.com", "/\\evil.com", "https://evil.com", "/@evil.com", "/a\nb", "javascript:alert(1)", ""])(
    "rejects %j",
    (bad) => expect(safeNext(bad)).toBe("/dashboard"),
  );
  it("rejects non-strings and honours the fallback", () => {
    expect(safeNext(null, "/x")).toBe("/x");
    expect(safeNext(undefined)).toBe("/dashboard");
  });
});
