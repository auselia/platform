import type { CavClass } from "@/lib/types";

// Trace samples are integers in 0.1 mV.
export const traceMv = (y: number[]) => y.map((v) => v / 10);

// Time of sample i, in µs from the trigger. Samples are evenly spread.
export function traceTime(i: number, n: number, t0: number, t1: number) {
  return n <= 1 ? t0 : t0 + ((t1 - t0) * i) / (n - 1);
}

// Index of the sample nearest to time t (µs), clamped to the trace.
export function nearestIndex(t: number, n: number, t0: number, t1: number) {
  if (n <= 1 || t1 <= t0) return 0;
  return Math.min(n - 1, Math.max(0, Math.round(((t - t0) / (t1 - t0)) * (n - 1))));
}

// Symmetric axis limit that is easy to read: 1, 1.5, 2, 3, 5, 7.5 times a power of ten.
export function niceLimit(maxAbs: number) {
  if (!(maxAbs > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(maxAbs)));
  const m = maxAbs / p;
  return ([1, 1.5, 2, 3, 5, 7.5, 10].find((s) => m <= s) ?? 10) * p;
}

export const CLASS_KEY: Record<CavClass, "cavClsBurst" | "cavClsSpike" | "cavClsWeak" | "cavClsOther"> = {
  burst: "cavClsBurst", spike: "cavClsSpike", weak: "cavClsWeak", other: "cavClsOther",
};
