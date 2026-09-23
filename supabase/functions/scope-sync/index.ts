// Oscilloscope control sync. The lab PC calls this every few seconds.
//
// Auth is the same two layers as `cavitation-ingest`: apikey header = project publishable
// key (platform gate), X-Api-Key = the plant's device key (device identity).
//
// One POST per cycle, body {state?, results?}:
//   state    what the PC sees right now (settings, snapshots, guard, drift, logger status)
//   results  outcomes of commands it ran since the last call
// The response carries the commands the PC should run next. Commands older than
// MAX_AGE_S are expired instead of returned, so a PC that was offline never changes the
// scope later, long after someone asked.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { authenticateDevice, jsonResponse } from "../_shared/device.ts";

const MAX_AGE_S = 120;
const MAX_RESULTS = 10;
const MAX_STATE_BYTES = 200_000;
const DONE = new Set(["done", "failed"]);

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function text(v: unknown, max: number): string | null {
  return typeof v === "string" ? v.slice(0, max) : null;
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

    const device = await authenticateDevice(req, ctx.supabaseAdmin);
    if (!device) return jsonResponse({ error: "invalid or missing X-Api-Key" }, 401);

    const raw = await req.text();
    if (raw.length > MAX_STATE_BYTES) return jsonResponse({ error: "body too large" }, 413);
    let body: Record<string, unknown>;
    try {
      body = obj(JSON.parse(raw)) ?? {};
    } catch {
      return jsonResponse({ error: "invalid JSON" }, 400);
    }
    const db = ctx.supabaseAdmin;
    const plantId = device.plantId;

    // 1. Results of commands the PC ran. Only rows of this plant that are still running can change.
    for (const r of arr(body.results).slice(0, MAX_RESULTS)) {
      const o = obj(r);
      const id = Number(o?.id);
      if (!o || !Number.isInteger(id) || !DONE.has(String(o.status))) continue;
      const { error } = await db.from("scope_commands")
        .update({ status: o.status, result: obj(o.result) ?? {}, finished_at: new Date().toISOString() })
        .eq("id", id).eq("plant_id", plantId).eq("status", "running");
      if (error) console.error("scope result failed", id, error);
    }

    // 2. State snapshot from the PC.
    const st = obj(body.state);
    if (st) {
      const row: Record<string, unknown> = {
        plant_id: plantId,
        settings: obj(st.settings),
        sweep: text(st.sweep, 20),
        run_state: text(st.run_state, 20),
        scope_error: text(st.scope_error, 300),
        snapshots: arr(st.snapshots).slice(0, 50),
        guard: obj(st.guard),
        drift: arr(st.drift).slice(0, 50),
        logger: obj(st.logger) ?? {},
        updated_at: new Date().toISOString(),
      };
      // The spec only changes with a new logger version, so the PC sends it rarely.
      if (Array.isArray(st.spec)) row.spec = st.spec;
      const { error } = await db.from("scope_state").upsert(row, { onConflict: "plant_id" });
      if (error) {
        console.error("scope state failed", error);
        return jsonResponse({ error: "state failed" }, 500);
      }
    }

    // 3. Expire stale commands, then claim the rest. The status filter makes the claim atomic:
    // a second overlapping call finds nothing left to claim.
    const cutoff = new Date(Date.now() - MAX_AGE_S * 1000).toISOString();
    await db.from("scope_commands")
      .update({ status: "expired", finished_at: new Date().toISOString() })
      .eq("plant_id", plantId).eq("status", "pending").lt("created_at", cutoff);

    const { data, error } = await db.from("scope_commands")
      .update({ status: "running", claimed_at: new Date().toISOString() })
      .eq("plant_id", plantId).eq("status", "pending")
      .select("id,kind,payload,created_at").order("id", { ascending: true });
    if (error) {
      console.error("scope claim failed", error);
      return jsonResponse({ error: "claim failed" }, 500);
    }

    // A command that stays "running" (the PC died mid-command) must not block the queue forever.
    await db.from("scope_commands")
      .update({ status: "failed", result: { error: "The PC did not report a result." }, finished_at: new Date().toISOString() })
      .eq("plant_id", plantId).eq("status", "running").lt("claimed_at", cutoff);

    return jsonResponse({ ok: true, commands: data ?? [] });
  }),
};
