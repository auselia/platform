import { describe, expect, it } from "vitest";
import { localeFromHost } from "./locale";

describe("localeFromHost", () => {
  it("defaults .cl domains to Spanish", () => {
    expect(localeFromHost("auselia.cl")).toBe("es");
    expect(localeFromHost("www.auselia.cl")).toBe("es");
    expect(localeFromHost("auselia.cl:3000")).toBe("es");
  });
  it("defaults everything else to English", () => {
    expect(localeFromHost("auselia.com")).toBe("en");
    expect(localeFromHost("www.auselia.com")).toBe("en");
    expect(localeFromHost("localhost:3000")).toBe("en");
    expect(localeFromHost(null)).toBe("en");
    expect(localeFromHost(undefined)).toBe("en");
  });
  it("does not false-positive on .cl appearing mid-hostname", () => {
    expect(localeFromHost("clever-preview.vercel.app")).toBe("en");
  });
});
