import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cavitation, CavitationScale } from "@/lib/types";
import type { Signal } from "./dsp";

const BUCKET = "cavitation-full";

// Turn raw ADC counts into a Signal in mV. volts = (raw - yref) * yinc + yorig, time = (i - xref) * xinc + xorig.
export function decodeSignal(bytes: Uint8Array, s: CavitationScale): Signal {
  const wide = s.dtype === "u2";
  const n = wide ? bytes.byteLength >> 1 : bytes.byteLength;
  if (n !== s.n) throw new Error(`expected ${s.n} samples, got ${n}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const mv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const raw = wide ? view.getUint16(i * 2, true) : bytes[i];
    mv[i] = ((raw - s.yref) * s.yinc + s.yorig) * 1e3;
  }
  return { mv, t0_us: (0 - s.xref) * s.xinc * 1e6 + s.xorig * 1e6, dt_us: s.xinc * 1e6 };
}

async function gunzip(blob: Blob): Promise<Uint8Array> {
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const cache = new Map<string, Signal>();

// Downloads and decodes the full waveform of a capture. Small cache, newest last.
export async function loadSignal(supabase: SupabaseClient, c: Pick<Cavitation, "full_path" | "scale">): Promise<Signal> {
  if (!c.full_path || !c.scale) throw new Error("no full waveform");
  const hit = cache.get(c.full_path);
  if (hit) return hit;
  const { data, error } = await supabase.storage.from(BUCKET).download(c.full_path);
  if (error || !data) throw new Error(error?.message ?? "download failed");
  const sig = decodeSignal(await gunzip(data), c.scale);
  if (cache.size >= 6) cache.delete(cache.keys().next().value!);
  cache.set(c.full_path, sig);
  return sig;
}
