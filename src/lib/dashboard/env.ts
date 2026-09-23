import type { Reading } from "@/lib/types";

export type EnvKey =
  | "moisture" | "roottemp" | "airtemp" | "humidity" | "pressure" | "ph" | "ec" | "weight" | "light";
export type Range = "day" | "week" | "month";
export type EnvSeries = Partial<Record<EnvKey, (number | null)[]>>;

const FIELD = {
  moisture: "soil_pct", roottemp: "root_temp_c", airtemp: "air_temp_c",
  humidity: "humidity_pct", pressure: "pressure_hpa", weight: "weight_g",
} as const;
type LiveKey = keyof typeof FIELD;
const LIVE_KEYS = Object.keys(FIELD) as LiveKey[];

export const ENV_KEYS: {
  key: EnvKey;
  fmt: (v: number) => string;
  // no hardware for this variable anywhere yet
  never?: boolean;
}[] = [
  { key: "moisture", fmt: (v) => v.toFixed(0) + "%" },
  { key: "roottemp", fmt: (v) => v.toFixed(1) + "°C" },
  { key: "airtemp", fmt: (v) => v.toFixed(1) + "°C" },
  { key: "humidity", fmt: (v) => v.toFixed(0) + "%" },
  { key: "pressure", fmt: (v) => v.toFixed(0) + " hPa" },
  { key: "ph", fmt: (v) => v.toFixed(2), never: true },
  { key: "ec", fmt: (v) => v.toFixed(2) + " mS", never: true },
  { key: "weight", fmt: (v) => v.toFixed(2) + "kg" },
  { key: "light", fmt: (v) => v.toFixed(0), never: true },
];

// The bucket a reading's timestamp falls into for week/month averaging, and the key
// DayPicker uses to mark a calendar day as having data. Local calendar day, not UTC.
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function value(r: Reading, k: LiveKey): number | null {
  const v = r[FIELD[k]];
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return k === "weight" ? v / 1000 : v;
}

// Day: raw points from the last 24h. Week/month: one averaged point per local
// calendar day. `anchor` is the reference "now" (the demo's readings are a
// static seed, so it anchors to its newest reading instead of the clock).
export function buildEnv(rows: Reading[], range: Range, anchor: number, jitter = 1) {
  const windowMs = range === "day" ? 86400000 : range === "week" ? 7 * 86400000 : 30 * 86400000;
  const windowed = rows.filter((r) => anchor - new Date(r.ts).getTime() <= windowMs);
  const env: EnvSeries = {};
  const scale = (v: number | null) => (v === null ? null : v * jitter);

  if (range === "day") {
    const dates = windowed.map((r) => new Date(r.ts));
    LIVE_KEYS.forEach((k) => { env[k] = windowed.map((r) => scale(value(r, k))); });
    return { dates, env };
  }

  const buckets = new Map<string, { date: Date; sums: Record<string, number>; counts: Record<string, number> }>();
  windowed.forEach((r) => {
    const d = new Date(r.ts);
    const key = dayKey(d);
    let b = buckets.get(key);
    if (!b) {
      b = { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), sums: {}, counts: {} };
      buckets.set(key, b);
    }
    LIVE_KEYS.forEach((k) => {
      const v = value(r, k);
      if (v !== null) {
        b!.sums[k] = (b!.sums[k] ?? 0) + v;
        b!.counts[k] = (b!.counts[k] ?? 0) + 1;
      }
    });
  });
  const list = [...buckets.values()];
  const dates = list.map((b) => b.date);
  LIVE_KEYS.forEach((k) => {
    env[k] = list.map((b) => (b.counts[k] ? scale(b.sums[k] / b.counts[k]) : null));
  });
  return { dates, env };
}

export function lastNonNull(arr: (number | null)[] | undefined): number | null {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v !== null && v !== undefined && !Number.isNaN(v)) return v;
  }
  return null;
}
