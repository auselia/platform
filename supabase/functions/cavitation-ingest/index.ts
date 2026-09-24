// Cavitation captures ingest. The lab PC uploader POSTs a batch of captures.
//
// Auth is the same two layers as `ingest`: apikey header = project publishable
// key (platform gate), X-Api-Key = this plant's own key (device identity).
//
// Idempotent: a capture that already exists (same plant and capture_key) is
// skipped, so the uploader can safely retry and never overwrites a flag.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { authenticateDevice, jsonResponse, readJson } from "../_shared/device.ts";

const MAX_BATCH = 20;
const MAX_POINTS = 4000;
const MAX_FULL_BYTES = 1_500_000; // gzip of one capture is about 16 KB, this is a generous ceiling
// A full batch is 20 captures, each with a base64 waveform of at most MAX_FULL_BYTES.
const MAX_BODY = Math.ceil((MAX_FULL_BYTES * 4) / 3) * MAX_BATCH + 400_000;
const MAX_FULL_B64 = Math.ceil((MAX_FULL_BYTES * 4) / 3) + 4;
const BUCKET = "cavitation-full";
const SCALE_KEYS = ["xinc", "xorig", "xref", "yinc", "yorig", "yref", "n"];
const KEY_RE = /^\d{8}_\d{6}_\d{3}_ch\d_\d{5}$/;
const CLASSES = new Set(["burst", "spike", "weak", "other"]);

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Returns a valid scale object, or null.
function toScale(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.dtype !== "u2" && o.dtype !== "u1") return null;
  const out: Record<string, unknown> = { dtype: o.dtype };
  for (const k of SCALE_KEYS) {
    const n = num(o[k]);
    if (n === null) return null;
    out[k] = n;
  }
  return out;
}

// Returns a row, or a string describing why the item is invalid.
function toRow(plantId: string, it: Record<string, unknown>): Record<string, unknown> | string {
  const key = String(it.key ?? "");
  if (!KEY_RE.test(key)) return `bad key ${key.slice(0, 40)}`;
  if (!CLASSES.has(String(it.cls))) return `${key}: bad class`;
  const ts = new Date(String(it.ts));
  if (Number.isNaN(ts.getTime())) return `${key}: bad ts`;
  const y = it.y;
  if (!Array.isArray(y) || y.length < 2 || y.length > MAX_POINTS || !y.every((n) => Number.isInteger(n))) {
    return `${key}: bad trace`;
  }
  const t0 = num(it.t0_us), t1 = num(it.t1_us);
  if (t0 === null || t1 === null || t1 <= t0) return `${key}: bad time range`;
  const flagged = it.flagged === true;
  return {
    plant_id: plantId,
    capture_key: key,
    ts: ts.toISOString(),
    ch: num(it.ch) ?? 1,
    cls: it.cls,
    level_mv: num(it.level_mv),
    peak_mv: num(it.peak_mv),
    snr: num(it.snr),
    dur_us: num(it.dur_us),
    swings: num(it.swings),
    freq_khz: num(it.freq_khz),
    sigma_mv: num(it.sigma_mv),
    vpp_mv: num(it.vpp_mv),
    clipped: it.clipped === true,
    t0_us: t0,
    t1_us: t1,
    ev0_us: num(it.ev0_us),
    ev1_us: num(it.ev1_us),
    y,
    flagged,
    flag_note: flagged ? String(it.note ?? "").slice(0, 300) : "",
    flagged_at: flagged ? new Date().toISOString() : null,
  };
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

    const device = await authenticateDevice(req, ctx.supabaseAdmin);
    if (!device) return jsonResponse({ error: "invalid or missing X-Api-Key" }, 401);

    const parsed = await readJson(req, MAX_BODY);
    if (!parsed.ok) return parsed.response;
    const payload = (parsed.body && typeof parsed.body === "object" ? parsed.body : {}) as { captures?: unknown };
    const items = payload.captures;
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_BATCH) {
      return jsonResponse({ error: `captures must be an array of 1 to ${MAX_BATCH}` }, 400);
    }

    const rows: Record<string, unknown>[] = [];
    const rejected: string[] = [];
    for (const it of items) {
      const r = toRow(device.plantId, (it ?? {}) as Record<string, unknown>);
      if (typeof r === "string") rejected.push(r);
      else rows.push(r);
    }
    if (rows.length === 0) return jsonResponse({ error: "no valid captures", rejected }, 400);

    const { data, error } = await ctx.supabaseAdmin
      .from("cavitation_captures")
      .upsert(rows, { onConflict: "plant_id,capture_key", ignoreDuplicates: true })
      .select("capture_key");
    if (error) {
      console.error("cavitation insert failed", error);
      return jsonResponse({ error: "insert failed" }, 500);
    }

    // Captures an owner deleted in the last 24 hours are still in the table, hidden. Their rows
    // already swallow a re-send (ignoreDuplicates above); make sure the re-send cannot bring the
    // waveform file back either.
    const sentKeys = (items as Record<string, unknown>[]).map((it) => String(it?.key ?? "")).filter(Boolean);
    const { data: hiddenRows } = await ctx.supabaseAdmin
      .from("cavitation_captures")
      .select("capture_key")
      .eq("plant_id", device.plantId)
      .not("deleted_at", "is", null)
      .in("capture_key", sentKeys);
    const hiddenKeys = new Set((hiddenRows ?? []).map((r: { capture_key: string }) => r.capture_key));

    // Full waveforms. Also runs for captures that already existed, so old rows get backfilled.
    // A failure here does not fail the batch: the metrics are already saved, and the uploader retries next start.
    let full = 0;
    const fullFailed: string[] = [];
    for (const it of items as Record<string, unknown>[]) {
      if (typeof it?.full_b64 !== "string") continue;
      const key = String(it.key ?? "");
      if (hiddenKeys.has(key)) continue;
      const scale = toScale(it.scale);
      if (!rows.some((r) => r.capture_key === key) || !scale) { fullFailed.push(`${key}: bad full waveform`); continue; }
      try {
        // Refuse before decoding: base64 is ~4/3 of the bytes it carries.
        if (it.full_b64.length > MAX_FULL_B64) throw new Error("size");
        const bytes = b64ToBytes(it.full_b64);
        if (bytes.length === 0 || bytes.length > MAX_FULL_BYTES) throw new Error("size");
        const path = `${device.plantId}/${key}.bin.gz`;
        const up = await ctx.supabaseAdmin.storage.from(BUCKET)
          .upload(path, bytes, { upsert: true, contentType: "application/gzip" });
        if (up.error) throw up.error;
        const upd = await ctx.supabaseAdmin.from("cavitation_captures")
          .update({ full_path: path, scale })
          .eq("plant_id", device.plantId).eq("capture_key", key);
        if (upd.error) throw upd.error;
        full++;
      } catch (e) {
        console.error("full waveform failed", key, e);
        fullFailed.push(`${key}: upload failed`);
      }
    }

    return jsonResponse({
      ok: true,
      full,
      full_failed: fullFailed,
      received: items.length,
      inserted: data?.length ?? 0,
      duplicates: rows.length - (data?.length ?? 0),
      rejected,
    }, 201);
  }),
};
