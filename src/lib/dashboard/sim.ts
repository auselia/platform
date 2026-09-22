import type { Status } from "@/lib/status";
import { buildCircuits, parsePathPoints, polygonCentroid, type Circuit } from "./geo";

// The demo org's circuits and sensor layout are simulated (there is no
// acoustic hardware yet). Everything is seeded from the plant id so it stays
// stable across renders and reloads.

export function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const range = (r: () => number, a: number, b: number) => a + r() * (b - a);
const int = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

export type SimNode = {
  stress: number; sensorCount: number; mmPlan: number; mmDelta: number;
};

export function simNode(seed: string, status: Status): SimNode {
  const r = rng(hashSeed("node:" + seed));
  const stress = status === "critical" ? range(r, 65, 90) : status === "warning" ? range(r, 30, 55) : range(r, 3, 22);
  return {
    stress: Math.round(stress),
    sensorCount: int(r, 1, 3),
    mmPlan: Math.round(range(r, 8, 22) * 10) / 10,
    mmDelta: status === "critical" ? int(r, 3, 6) : status === "warning" ? int(r, 1, 3) : 0,
  };
}

export type SensorDot = {
  id: string; label: string; x: number; y: number; status: Status;
  circuitIdx: number; jitter: number;
};

function sensorStatusFor(cuartel: Status, r: () => number): Status {
  const x = r();
  if (cuartel === "critical") return x < 0.55 ? "critical" : x < 0.85 ? "warning" : "good";
  if (cuartel === "warning") return x < 0.5 ? "warning" : x < 0.75 ? "good" : "critical";
  return x < 0.82 ? "good" : "warning";
}

export function buildSensorLayout(
  seed: string, path: string, status: Status, sensorCount: number,
): { dots: SensorDot[]; circuits: Circuit[] } {
  const poly = parsePathPoints(path);
  const circuits = buildCircuits(poly, sensorCount);
  const assign: number[] = [];
  for (let i = 0; i < sensorCount; i++) assign.push(i % circuits.length);
  const per: Record<number, number> = {};
  assign.forEach((ci) => { per[ci] = (per[ci] ?? 0) + 1; });
  const seen: Record<number, number> = {};
  const dots = assign.map((ci, i) => {
    const c = circuits[ci];
    seen[ci] = (seen[ci] ?? 0) + 1;
    const frac = seen[ci] / (per[ci] + 1);
    const r = rng(hashSeed(`sensor:${seed}:${i}`));
    const st = sensorStatusFor(status, r);
    return {
      id: `Sensor ${i + 1}`, label: `Sensor ${i + 1}`,
      x: c.x1 + frac * (c.x2 - c.x1), y: c.y1 + frac * (c.y2 - c.y1),
      status: st, circuitIdx: ci,
      jitter: 0.94 + r() * 0.12,
    };
  });
  return { dots, circuits };
}

export function liveSensor(label: string, path: string, status: Status): SensorDot {
  const c = polygonCentroid(parsePathPoints(path));
  return { id: label, label, x: c[0], y: c[1], status, circuitIdx: 0, jitter: 1 };
}
