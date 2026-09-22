import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeSignal } from "./cavitation-full";

const scale = { dtype: "u2" as const, n: 4, xinc: 4e-9, xorig: -1e-6, xref: 0, yinc: 1e-4, yorig: 0, yref: 32768 };

describe("decodeSignal", () => {
  it("scales little-endian 16-bit counts to mV and builds the time axis in µs", () => {
    const raw = new Uint8Array(new Uint16Array([32768, 32868, 32668, 33768]).buffer);
    const s = decodeSignal(raw, scale);
    expect(Array.from(s.mv).map((x) => +x.toFixed(6))).toEqual([0, 10, -10, 100]);
    expect(s.t0_us).toBeCloseTo(-1, 9);
    expect(s.dt_us).toBeCloseTo(0.004, 9);
  });
  it("uses xref as the sample that sits at xorig", () => {
    const raw = new Uint8Array(new Uint16Array([0, 0, 0, 0]).buffer);
    expect(decodeSignal(raw, { ...scale, xref: 2 }).t0_us).toBeCloseTo(-1.008, 9);
  });
  it("reads 8-bit samples", () => {
    const s = decodeSignal(Uint8Array.from([128, 138]), { ...scale, dtype: "u1", n: 2, yref: 128, yinc: 1e-3 });
    expect(Array.from(s.mv)).toEqual([0, 10]);
  });
  it("rejects a sample count that does not match", () => {
    expect(() => decodeSignal(new Uint8Array(6), scale)).toThrow(/expected 4/);
  });
  it("round-trips through gzip like the stored objects", async () => {
    const raw = new Uint8Array(new Uint16Array([1, 2, 3, 4]).buffer);
    const zipped = gzipSync(raw);
    const out = new Uint8Array(await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    expect(Array.from(out)).toEqual(Array.from(raw));
  });
});
