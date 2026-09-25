// Serves the firmware image an Owner rolled out to this device (OTA, firmware/CONTRACT.md
// section 3). The device downloads the URL irrigation-config gives it and sends its own
// X-Api-Key, so this is authenticated per device; the bucket itself is private because the
// binary embeds the WiFi password and the device key.
//
// Fails closed: it refuses to serve a file whose size or SHA-256 differs from what was
// registered, or that does not begin with the ESP32 image magic byte (0xE9). It also always
// sets Content-Length, which the firmware requires before it will start flashing.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { authenticateDevice, jsonResponse } from "../_shared/device.ts";

const ESP_IMAGE_MAGIC = 0xe9;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    if (req.method !== "GET") {
      return jsonResponse({ error: "method not allowed" }, 405);
    }

    const device = await authenticateDevice(req, ctx.supabaseAdmin);
    if (!device) {
      return jsonResponse({ error: "invalid or missing X-Api-Key" }, 401);
    }

    const { data: t, error } = await ctx.supabaseAdmin
      .from("firmware_target")
      .select("firmware_releases!inner(version, storage_path, size_bytes, sha256)")
      .eq("plant_id", device.plantId)
      .maybeSingle();
    if (error) {
      console.error("firmware-download lookup failed", error);
      return jsonResponse({ error: "lookup failed" }, 500);
    }
    const rel = (t as { firmware_releases?: Release | Release[] } | null)?.firmware_releases;
    const release = Array.isArray(rel) ? rel[0] : rel;
    if (!release) return jsonResponse({ error: "no firmware rolled out" }, 404);

    const file = await ctx.supabaseAdmin.storage.from("firmware").download(release.storage_path);
    if (file.error || !file.data) {
      console.error("firmware-download storage failed", release.storage_path, file.error);
      return jsonResponse({ error: "firmware file unavailable" }, 502);
    }
    const bytes = new Uint8Array(await file.data.arrayBuffer());

    if (bytes.length !== release.size_bytes || bytes[0] !== ESP_IMAGE_MAGIC || (await sha256Hex(bytes)) !== release.sha256) {
      console.error("firmware-download integrity check failed", release.storage_path);
      return jsonResponse({ error: "firmware failed integrity check" }, 502);
    }

    console.log("firmware-download serving", release.version, "to plant", device.plantId);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
      },
    });
  }),
};

type Release = { version: string; storage_path: string; size_bytes: number; sha256: string };
