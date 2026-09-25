// Device-facing irrigation schedule poll (GET only - the dashboard writes
// directly via the Supabase client + RLS, no function needed for that side).
//
// Same two-layer auth as ingest: apikey = project publishable key (platform
// gate), X-Api-Key = this plant's own key (see _shared/device.ts).
//
// Besides the schedule it carries the manual pump command and the firmware update the
// device should apply (see _shared/device-config.ts and firmware/CONTRACT.md section 3).

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { authenticateDevice, jsonResponse } from "../_shared/device.ts";
import { buildConfigResponse, type ConfigRow, type FirmwareTarget } from "../_shared/device-config.ts";

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    if (req.method !== "GET") {
      return jsonResponse({ error: "method not allowed" }, 405);
    }

    const device = await authenticateDevice(req, ctx.supabaseAdmin);
    if (!device) {
      return jsonResponse({ error: "invalid or missing X-Api-Key" }, 401);
    }

    const { data, error } = await ctx.supabaseAdmin
      .from("irrigation_config")
      .select("hour1, min1, hour2, min2, duration_min, enabled, manual_pump_on, manual_command_at")
      .eq("plant_id", device.plantId)
      .maybeSingle();

    if (error) {
      console.error("irrigation-config lookup failed", error);
      return jsonResponse({ error: "lookup failed" }, 500);
    }

    // The update this device should be running, if an Owner rolled one out.
    let target: FirmwareTarget | null = null;
    const { data: t } = await ctx.supabaseAdmin
      .from("firmware_target")
      .select("firmware_releases!inner(version)")
      .eq("plant_id", device.plantId)
      .maybeSingle();
    const release = (t as { firmware_releases?: { version: string } | { version: string }[] } | null)?.firmware_releases;
    const version = Array.isArray(release) ? release[0]?.version : release?.version;
    if (version) {
      target = { version, url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/firmware-download` };
    }

    // No row yet for this plant (freshly provisioned): buildConfigResponse falls back to the
    // schema's own defaults, so the device always gets a sane schedule rather than an error.
    return jsonResponse(buildConfigResponse(data as ConfigRow | null, target, Date.now()));
  }),
};
