import type { SupabaseClient } from "@supabase/supabase-js";

// Deleting captures from the dashboard. RLS is the real gate (only an org's Owner can delete,
// see 20260923050000_delete_captures.sql); this just does the work in safe-sized batches.
// A row is deleted first (it is what the dashboard reads), then its full waveform file, so a
// failure between the two leaves an invisible orphaned file rather than a capture that
// silently lost its waveform.

const BATCH = 100;
const PAGE = 500;
const BUCKET = "cavitation-full";

export type CaptureFilter = {
  plantId: string;
  from: string | null; // ISO timestamps, inclusive
  to: string | null;
  includeFlagged: boolean;
};

export type CaptureRow = { id: number; ts: string; cls: "burst" | "spike" | "weak" | "other"; peak_mv: number | null; flagged: boolean };

export type DeleteResult = {
  deleted: number;
  // Waveform files that could not be removed (their rows are already gone).
  filesLeft: number;
  failed: boolean;
  stopped: boolean;
};

function scoped(supabase: SupabaseClient, f: CaptureFilter, cols: string, opts?: { count: "exact"; head: true }) {
  let q = supabase.from("cavitation_captures").select(cols, opts).eq("plant_id", f.plantId);
  if (f.from) q = q.gte("ts", f.from);
  if (f.to) q = q.lte("ts", f.to);
  if (!f.includeFlagged) q = q.eq("flagged", false);
  return q;
}

export async function countMatching(supabase: SupabaseClient, f: CaptureFilter): Promise<number | null> {
  const { count, error } = await scoped(supabase, f, "id", { count: "exact", head: true });
  return error ? null : count ?? 0;
}

export async function listMatching(supabase: SupabaseClient, f: CaptureFilter, limit: number): Promise<CaptureRow[]> {
  const { data, error } = await scoped(supabase, f, "id,ts,cls,peak_mv,flagged").order("ts", { ascending: false }).limit(limit);
  return error ? [] : ((data ?? []) as unknown as CaptureRow[]);
}

export async function deleteIds(supabase: SupabaseClient, ids: number[], onProgress?: (done: number) => void): Promise<DeleteResult> {
  const out: DeleteResult = { deleted: 0, filesLeft: 0, failed: false, stopped: false };
  for (let i = 0; i < ids.length; i += BATCH) {
    const { data, error } = await supabase
      .from("cavitation_captures").delete().in("id", ids.slice(i, i + BATCH)).select("id,full_path");
    if (error) return { ...out, failed: true };
    const rows = (data ?? []) as { id: number; full_path: string | null }[];
    out.deleted += rows.length;
    const paths = rows.map((r) => r.full_path).filter((p): p is string => !!p);
    if (paths.length) {
      const { error: fileError } = await supabase.storage.from(BUCKET).remove(paths);
      if (fileError) out.filesLeft += paths.length;
    }
    onProgress?.(out.deleted);
  }
  // Asked to delete something and nothing went: not permitted, or already gone.
  if (ids.length > 0 && out.deleted === 0) out.failed = true;
  return out;
}

// "Everything matching the filter", for a flood too big to tick one by one. Re-queries each
// round so it needs no list held in memory, and stops if a round deletes nothing (which would
// otherwise loop forever, e.g. if the caller is not allowed to delete).
export async function deleteMatching(
  supabase: SupabaseClient, f: CaptureFilter, onProgress: (done: number) => void, shouldStop: () => boolean,
): Promise<DeleteResult> {
  const out: DeleteResult = { deleted: 0, filesLeft: 0, failed: false, stopped: false };
  for (;;) {
    if (shouldStop()) return { ...out, stopped: true };
    const { data, error } = await scoped(supabase, f, "id").order("ts", { ascending: false }).limit(PAGE);
    if (error) return { ...out, failed: true };
    const ids = ((data ?? []) as unknown as { id: number }[]).map((r) => r.id);
    if (!ids.length) return out;
    const before = out.deleted;
    const r = await deleteIds(supabase, ids, (n) => onProgress(before + n));
    out.deleted += r.deleted;
    out.filesLeft += r.filesLeft;
    onProgress(out.deleted);
    if (r.failed) return { ...out, failed: true };
  }
}
