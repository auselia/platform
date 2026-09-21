import { describe, expect, it } from "vitest";
import { nearestIndex, niceLimit, traceMv, traceTime } from "./cavitation";

describe("cavitation trace helpers", () => {
  it("converts 0.1 mV integers to mV", () => {
    expect(traceMv([10, -25, 0])).toEqual([1, -2.5, 0]);
  });
  it("spreads samples evenly from t0 to t1", () => {
    expect(traceTime(0, 5, -100, 100)).toBe(-100);
    expect(traceTime(2, 5, -100, 100)).toBe(0);
    expect(traceTime(4, 5, -100, 100)).toBe(100);
  });
  it("finds the nearest sample and clamps to the trace", () => {
    expect(nearestIndex(0, 5, -100, 100)).toBe(2);
    expect(nearestIndex(-999, 5, -100, 100)).toBe(0);
    expect(nearestIndex(999, 5, -100, 100)).toBe(4);
  });
  it("rounds axis limits to readable steps", () => {
    expect(niceLimit(0.8)).toBe(1);
    expect(niceLimit(73)).toBe(75);
    expect(niceLimit(130)).toBe(150);
    expect(niceLimit(228)).toBe(300);
    expect(niceLimit(0)).toBe(1);
  });
});
