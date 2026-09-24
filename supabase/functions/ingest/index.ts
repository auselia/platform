// Device readings ingest. A plant/device POSTs its sensor snapshot here.
//
// Auth: apikey header = project publishable key (platform gate, checked by
// withSupabase before this code runs). X-Api-Key header = this specific
// plant's own key (see _shared/device.ts) - that's what ties the reading
// to a plant_id.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { authenticateDevice, jsonResponse, readJson } from "../_shared/device.ts";

const MAX_BODY = 10_000;
// The ESP32 uploads hourly; anything faster than this is a bug or abuse, not data.
const MIN_INTERVAL_MS = 10_000;

// Physically plausible ranges; a value outside one is dropped (stored as null), not rejected,
// so one bad sensor doesn't lose the rest of the snapshot.
const RANGES: Record<string, [number, number]> = {
  soil_pct: [0, 100],
  root_temp_c: [-60, 120],
  air_temp_c: [-60, 120],
  humidity_pct: [0, 100],
  pressure_hpa: [300, 1200],
  weight_g: [0, 1_000_000],
};

function num(v: unknown, key: string): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const [lo, hi] = RANGES[key];
  return n >= lo && n <= hi ? n : null;
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    if (req.method !== "POST") {
      return jsonResponse({ error: "method not allowed" }, 405);
    }

    const device = await authenticateDevice(req, ctx.supabaseAdmin);
    if (!device) {
      return jsonResponse({ error: "invalid or missing X-Api-Key" }, 401);
    }

    const parsed = await readJson(req, MAX_BODY);
    if (!parsed.ok) return parsed.response;
    const payload = (parsed.body && typeof parsed.body === "object" ? parsed.body : {}) as Record<string, unknown>;

    const { data: last } = await ctx.supabaseAdmin
      .from("readings")
      .select("ts")
      .eq("plant_id", device.plantId)
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && Date.now() - new Date(last.ts).getTime() < MIN_INTERVAL_MS) {
      return jsonResponse({ error: "too many requests" }, 429);
    }

    const record = {
      plant_id: device.plantId,
      soil_pct: num(payload.soil_pct, "soil_pct"),
      root_temp_c: num(payload.root_temp_c, "root_temp_c"),
      air_temp_c: num(payload.air_temp_c, "air_temp_c"),
      humidity_pct: num(payload.humidity_pct, "humidity_pct"),
      pressure_hpa: num(payload.pressure_hpa, "pressure_hpa"),
      weight_g: num(payload.weight_g, "weight_g"),
    };

    const { data, error } = await ctx.supabaseAdmin
      .from("readings")
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error("ingest insert failed", error);
      return jsonResponse({ error: "insert failed" }, 500);
    }

    return jsonResponse({ ok: true, stored: data }, 201);
  }),
};
