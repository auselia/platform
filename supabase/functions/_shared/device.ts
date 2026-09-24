// Shared helpers for device-facing Edge Functions (ingest, irrigation-config).
//
// Two auth layers, deliberately separate:
//   1. Platform gate (enforced by withSupabase/Supabase's gateway): every
//      request needs a valid publishable or secret key in the `apikey`
//      header, checked before our code runs. The ESP32 sends the project's
//      PUBLISHABLE key here - safe to embed in firmware, same as it's safe
//      in browser code.
//   2. Device identity (our own): the X-Api-Key header, hashed and looked up
//      in plant_device_keys below. This is what actually says "which plant
//      is this reading for" - the publishable key alone doesn't identify a
//      device. A plant can have more than one key (e.g. Hope's ESP32 and its
//      oscilloscope logger are two physical devices, one plant).
//
// authenticateDevice() takes ctx.supabaseAdmin (from withSupabase) so it
// deliberately bypasses RLS - the X-Api-Key check IS the gate here.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const MAX_KEY_LENGTH = 200;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Looks up the plant that owns this API key. Returns null if the header is
// missing or the key doesn't match any plant - callers should respond 401.
export async function authenticateDevice(
  req: Request,
  supabase: SupabaseClient,
): Promise<{ plantId: string } | null> {
  const apiKey = req.headers.get("x-api-key");
  // Reject junk before it costs a database lookup (the publishable key is public, so anyone
  // can reach this code). Length only: existing device keys must keep working as-is.
  if (!apiKey || apiKey.length > MAX_KEY_LENGTH) return null;

  const hash = await sha256Hex(apiKey);
  const { data, error } = await supabase
    .from("plant_device_keys")
    .select("plant_id")
    .eq("key_hash", hash)
    .maybeSingle();

  if (error || !data) return null;
  return { plantId: data.plant_id };
}

// Reads a JSON body with a hard size ceiling, checked against Content-Length first and the
// real length after, so an oversized payload is refused before it is parsed.
export async function readJson(
  req: Request,
  maxBytes: number,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return { ok: false, response: jsonResponse({ error: "body too large" }, 413) };
  const raw = await req.text();
  if (raw.length > maxBytes) return { ok: false, response: jsonResponse({ error: "body too large" }, 413) };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, response: jsonResponse({ error: "invalid JSON" }, 400) };
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
