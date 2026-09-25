import { describe, expect, it } from "vitest";
import { ESP_IMAGE_MAGIC, checkFirmwareFile, firmwarePath, formatUptime, sha256Hex, wifiQuality } from "./firmware";

const image = (size: number, first = ESP_IMAGE_MAGIC) => {
  const b = new Uint8Array(size);
  b[0] = first;
  return b;
};

describe("checkFirmwareFile", () => {
  it("accepts a plausible ESP32 image with a sane version", () => {
    expect(checkFirmwareFile("0.2.0", image(900_000))).toBeNull();
    expect(checkFirmwareFile("1.0.0-rc.1+build5", image(60_000))).toBeNull();
  });

  it("rejects versions that could break the path or the device's string compare", () => {
    for (const v of ["", "a b", "../x", "v1/2", "x".repeat(33), "0.2.0\n"]) {
      expect(checkFirmwareFile(v, image(900_000))).toBe("version");
    }
  });

  it("rejects files that are too small, too large, or not an ESP image", () => {
    expect(checkFirmwareFile("1", image(10))).toBe("size");
    expect(checkFirmwareFile("1", image(4_000_000))).toBe("size");
    expect(checkFirmwareFile("1", image(900_000, 0x7f))).toBe("magic");
  });
});

describe("helpers", () => {
  it("builds the storage path the database function requires", () => {
    expect(firmwarePath("abc", "0.2.0")).toBe("abc/0.2.0.bin");
  });

  it("hashes like the server does (known SHA-256 of 'abc')", async () => {
    const buf = new TextEncoder().encode("abc");
    expect(await sha256Hex(buf.buffer as ArrayBuffer)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("bands WiFi signal strength", () => {
    expect(wifiQuality(-40)).toBe("excellent");
    expect(wifiQuality(-63)).toBe("good");
    expect(wifiQuality(-72)).toBe("fair");
    expect(wifiQuality(-88)).toBe("weak");
  });

  it("formats uptime with the two largest units", () => {
    expect(formatUptime(20_000)).toBe("<1 min");
    expect(formatUptime(8 * 60_000)).toBe("8 min");
    expect(formatUptime((5 * 60 + 12) * 60_000)).toBe("5 h 12 min");
    expect(formatUptime((3 * 1440 + 4 * 60) * 60_000)).toBe("3 d 4 h");
  });
});
