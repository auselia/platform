import { describe, expect, it } from "vitest";
import type { ScopeSettingSpec } from "@/lib/types";
import {
  buildChanges, cleanSnapshotName, groupSpec, parseNumber, pcOnline, toDisplay,
} from "./scope-control";

const spec: ScopeSettingSpec[] = [
  { id: "trig_level", group: "Trigger", label: "Level", type: "num", unit: "mV", mult: 1000, step: 1 },
  { id: "trig_slope", group: "Trigger", label: "Slope", type: "enum", options: [{ send: "POSitive", reply: "POS" }, { send: "NEGative", reply: "NEG" }] },
  { id: "ch1_display", group: "Channel 1", label: "Shown", type: "bool" },
];
const cur = { trig_level: 0.07, trig_slope: "POS", ch1_display: 1 };

describe("scope control helpers", () => {
  it("shows volts as millivolts without float noise", () => {
    expect(toDisplay(spec[0], 0.07100000000000001)).toBe("71");
    expect(toDisplay(spec[2], 1)).toBe(true);
    expect(toDisplay(spec[1], "POS")).toBe("POS");
  });
  it("parses typed numbers in the display unit, comma or dot", () => {
    expect(parseNumber("71", 1000)).toBeCloseTo(0.071, 9);
    expect(parseNumber(" 7,5 ", 1000)).toBeCloseTo(0.0075, 9);
    expect(parseNumber("", 1000)).toBeNull();
    expect(parseNumber("abc", 1000)).toBeNull();
    expect(parseNumber("1e400", 1)).toBeNull();
  });
  it("sends only what changed, in the scope's units", () => {
    const r = buildChanges(spec, cur, { trig_level: "71", trig_slope: "POS", ch1_display: true });
    expect(r.errors).toEqual({});
    expect(Object.keys(r.changes)).toEqual(["trig_level"]);
    expect(r.changes.trig_level).toBeCloseTo(0.071, 9);
  });
  it("sends an enum by its reply value and accepts the long form", () => {
    expect(buildChanges(spec, cur, { trig_slope: "NEG" }).changes).toEqual({ trig_slope: "NEG" });
    expect(buildChanges(spec, cur, { trig_slope: "NEGative" }).changes).toEqual({ trig_slope: "NEG" });
  });
  it("sends booleans as true or false", () => {
    expect(buildChanges(spec, cur, { ch1_display: false }).changes).toEqual({ ch1_display: false });
  });
  it("reports bad numbers and unknown enum values instead of sending them", () => {
    const r = buildChanges(spec, cur, { trig_level: "x", trig_slope: "SIDEWAYS" });
    expect(r.changes).toEqual({});
    expect(r.errors).toEqual({ trig_level: "number", trig_slope: "value" });
  });
  it("ignores a change smaller than the scope's own rounding", () => {
    expect(buildChanges(spec, cur, { trig_level: "70.00001" }).changes).toEqual({});
  });
  it("groups settings in the order the PC lists them", () => {
    expect(groupSpec(spec).map((g) => [g.group, g.items.length])).toEqual([["Trigger", 2], ["Channel 1", 1]]);
  });
  it("treats the PC as offline after two minutes without a report", () => {
    const now = Date.parse("2026-09-23T12:00:00Z");
    expect(pcOnline("2026-09-23T11:59:00Z", now)).toBe(true);
    expect(pcOnline("2026-09-23T11:57:00Z", now)).toBe(false);
    expect(pcOnline(null, now)).toBe(false);
  });
  it("cleans snapshot names like the PC does", () => {
    expect(cleanSnapshotName("  before test #2 ")).toBe("before_test_2");
    expect(cleanSnapshotName("a".repeat(60)).length).toBe(40);
  });
});
