// Device log events (firmware/CONTRACT.md section 2). The firmware buffers named lifecycle
// events and problems in RAM and flushes them in one POST on its config-poll timer (5 minutes,
// 20 seconds while the pump runs). Not a live tail, and not the raw Serial output.
//
// Same two-layer auth as ingest: apikey = publishable key, X-Api-Key = this plant's own key.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { authenticateDevice, jsonResponse, readJson } from "../_shared/device.ts";

const MAX_BODY = 20_000;
const MAX_EVENTS = 50;
const MAX_MESSAGE = 300;
// The firmware flushes at most every 20 seconds; faster is a bug or abuse.
const MIN_INTERVAL_MS = 5_000;
const LEVELS = new Set(["event", "warning", "error"]);

type CleanEvent = { uptime_ms: number; level: string; message: string };

// Keeps only well-formed events; anything else is counted as rejected, not stored.
function clean(raw: unknown): { events: CleanEvent[]; rejected: number } {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_EVENTS) : [];
  const events: CleanEvent[] = [];
  for (const e of list) {
    const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    const uptime = Number(o.uptime_ms);
    // deno-lint-ignore no-control-regex
    const message = typeof o.message === "string" ? o.message.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_MESSAGE) : "";
    if (Number.isInteger(uptime) && uptime >= 0 && uptime < 1e13 && typeof o.level === "string" && LEVELS.has(o.level) && message) {
      events.push({ uptime_ms: uptime, level: o.level, message });
    }
  }
  return { events, rejected: (Array.isArray(raw) ? raw.length : 0) - events.length };
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

    const { events, rejected } = clean(payload.events);
    if (events.length === 0) {
      return jsonResponse({ error: `events must be an array of 1 to ${MAX_EVENTS} valid events`, rejected }, 400);
    }

    const { data: last } = await ctx.supabaseAdmin
      .from("device_logs")
      .select("created_at")
      .eq("plant_id", device.plantId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && Date.now() - new Date(last.created_at).getTime() < MIN_INTERVAL_MS) {
      return jsonResponse({ error: "too many requests" }, 429);
    }

    const { data: stored, error } = await ctx.supabaseAdmin.rpc("append_device_logs", {
      target_plant: device.plantId,
      events,
    });
    if (error) {
      console.error("device-logs insert failed", error);
      return jsonResponse({ error: "insert failed" }, 500);
    }

    return jsonResponse({ ok: true, stored, rejected }, 201);
  }),
};
