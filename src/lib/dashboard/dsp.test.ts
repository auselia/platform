import { describe, expect, it } from "vitest";
import { csvSignal, envelope, fft, niceTicks, sliceRange, spectrum, stats, type Signal, windowFn } from "./dsp";

// 250 kHz sine, 2 mV peak, sampled every 0.04 µs (25 MS/s), 2000 samples = 80 µs.
const mk = (n = 2000, amp = 2, fKhz = 250, offset = 0, dtUs = 0.04, t0 = -40): Signal => {
  const mv = new Float64Array(n);
  for (let i = 0; i < n; i++) mv[i] = offset + amp * Math.sin(2 * Math.PI * fKhz * 1e3 * (i * dtUs * 1e-6));
  return { mv, t0_us: t0, dt_us: dtUs };
};

describe("fft", () => {
  it("matches a known transform", () => {
    const re = Float64Array.from([1, 2, 3, 4]), im = new Float64Array(4);
    fft(re, im);
    expect(Array.from(re).map((x) => Math.round(x))).toEqual([10, -2, -2, -2]);
    expect(Array.from(im).map((x) => Math.round(x))).toEqual([0, 2, 0, -2]);
  });
  it("rejects a length that is not a power of two", () => {
    expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow();
  });
});

describe("windows", () => {
  it("hann is symmetric and zero at the ends, like numpy", () => {
    const w = windowFn("hann", 5);
    expect(Array.from(w).map((x) => +x.toFixed(6))).toEqual([0, 0.5, 1, 0.5, 0]);
  });
});

describe("spectrum", () => {
  it("finds the frequency and peak amplitude of a sine, with a DC offset removed", () => {
    const s = mk(2000, 2, 250, 5);
    const sp = spectrum(s, -40, 40, { fminKhz: 100, fmaxKhz: 1000, win: "hann", pad: 8, ref: false });
    if ("error" in sp) throw new Error(sp.error);
    expect(sp.peaks[0].f_khz).toBeGreaterThan(245);
    expect(sp.peaks[0].f_khz).toBeLessThan(255);
    expect(sp.peaks[0].a_mv).toBeGreaterThan(1.9);
    expect(sp.peaks[0].a_mv).toBeLessThan(2.1);
    expect(sp.nyq_khz).toBeCloseTo(12500, 0);
  });
  it("builds a noise reference outside the selection", () => {
    const s = mk(4000);
    const sp = spectrum(s, -40, 0, { fminKhz: 50, fmaxKhz: 500, win: "hann", pad: 4, ref: true });
    if ("error" in sp) throw new Error(sp.error);
    expect(sp.ref).not.toBeNull();
    expect(sp.ref_t![0]).toBeGreaterThanOrEqual(0);
  });
  it("reports a selection that is too short and a range that cannot be resolved", () => {
    const s = mk();
    expect(spectrum(s, 0, 0.2, { fminKhz: 0, fmaxKhz: 100, win: "hann", pad: 1, ref: false })).toEqual({ error: "shortSelection" });
    expect(spectrum(s, -40, 40, { fminKhz: 5e5, fmaxKhz: 6e5, win: "hann", pad: 1, ref: false })).toEqual({ error: "outOfRange" });
  });
});

describe("stats", () => {
  it("computes range, mean, ac RMS and the dominant frequency", () => {
    const s = mk(2000, 2, 250, 5);
    const r = stats(s, -40, 40)!;
    expect(r.n).toBe(2000);
    expect(r.max_mv).toBeCloseTo(7, 1);
    expect(r.min_mv).toBeCloseTo(3, 1);
    expect(r.vpp_mv).toBeCloseTo(4, 1);
    expect(r.mean_mv).toBeCloseTo(5, 1);
    expect(r.rms_mv).toBeCloseTo(2 / Math.SQRT2, 1);
    expect(Math.abs(r.freq_khz! - 250)).toBeLessThan(5);
  });
  it("returns null for fewer than 2 samples", () => {
    expect(stats(mk(), 0, 0.001)).toBeNull();
  });
});

describe("slicing and envelope", () => {
  it("maps a time range to sample indexes inside the record", () => {
    const s = mk(100, 1, 250, 0, 1, 0);
    expect(sliceRange(s, 10, 20)).toEqual([10, 21]);
    expect(sliceRange(s, -50, 500)).toEqual([0, 100]);
  });
  it("keeps min and max per column and never drops a spike", () => {
    const s = mk(1000, 0.1, 250, 0, 1, 0);
    s.mv[437] = 9;
    const { hi } = envelope(s, 0, 999, 50);
    expect(Math.max(...Array.from(hi))).toBe(9);
  });
});

describe("helpers", () => {
  it("gives readable ticks", () => {
    expect(niceTicks(0, 100, 5).ticks).toEqual([0, 20, 40, 60, 80, 100]);
  });
  it("writes the signal as volts and seconds", () => {
    const s: Signal = { mv: Float64Array.from([1000, -500]), t0_us: 0, dt_us: 1 };
    expect(csvSignal(s, 0, 1).split("\n")[1]).toBe("0.000000000e+0,1.0000000e+0");
  });
});
