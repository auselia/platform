import { describe, expect, it } from "vitest";
import { DEMO_GEO } from "./demo-geo";
import { buildSensorLayout, rng, simNode } from "./sim";

describe("seeded simulation", () => {
  it("is deterministic for the same seed", () => {
    expect(simNode("plant-1", "warning")).toEqual(simNode("plant-1", "warning"));
    const a = rng(42), b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("differs between plants", () => {
    expect(simNode("plant-1", "good")).not.toEqual(simNode("plant-2", "good"));
  });
  it("keeps values in sane ranges", () => {
    const n = simNode("x", "critical");
    expect(n.sensorCount).toBeGreaterThanOrEqual(1);
    expect(n.sensorCount).toBeLessThanOrEqual(3);
    expect(n.mmDelta).toBeGreaterThan(0);
    expect(simNode("x", "good").mmDelta).toBe(0);
  });
});

describe("sensor layout", () => {
  it("places the requested number of sensors", () => {
    const { dots } = buildSensorLayout("p", DEMO_GEO.cuarteles[4].path, "good", 3);
    expect(dots).toHaveLength(3);
    expect(new Set(dots.map((d) => d.id)).size).toBe(3);
  });
});
