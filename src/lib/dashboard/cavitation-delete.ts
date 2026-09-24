import type { SupabaseClient } from "@supabase/supabase-js";

// Deleting captures from the dashboard. Nothing is destroyed right away: a delete hides the
// captures for RETENTION_HOURS (they can be restored, and a logger re-sending the same capture
// is ignored meanwhile), then they are purged for good, rows and waveform files. RLS and the
// owner check inside the SQL functions (20260923060000_soft_delete_captures.sql) are the real
// gate; this module just calls them.

export const RETENTION_HOURS = 24;

const IDS_PER_CALL = 500;
const FILES_PER_CALL = 100;
const BUCKET = "cavitation-full";

export type CaptureFilter = {
  plantId: string;
  from: string | null; // ISO timestamps, inclusive
  to: string | null;
  includeFlagged: boolean;
};

export type CaptureRow = { id: number; ts: string; cls: "burst" | "spike" | "weak" | "other"; peak_mv: number | null; flagged: boolean };
export type DeletedRow = CaptureRow & { deleted_at: string; total: number };

// What Undo needs to bring back exactly what one delete hid: specific ids, or a delete-wide
// timestamp shared by every row a single "everything matching" call hid.
export type UndoToken = { plantId: string; ids?: number[]; at?: string };
export type DeleteOutcome = { count: number; undo: UndoToken | null; failed: boolean };

function live(supabase: SupabaseClient, f: CaptureFilter, cols: string, opts?: { count: "exact"; head: true }) {
  let q = supabase.from("cavitation_captures").select(cols, opts).eq("plant_id", f.plantId);
  if (f.from) q = q.gte("ts", f.from);
  if (f.to) q = q.lte("ts", f.to);
  if (!f.includeFlagged) q = q.eq("flagged", false);
  return q;
}

export async function countMatching(supabase: SupabaseClient, f: CaptureFilter): Promise<number | null> {
  const { count, error } = await live(supabase, f, "id", { count: "exact", head: true });
  return error ? null : count ?? 0;
}

export async function listMatching(supabase: SupabaseClient, f: CaptureFilter, limit: number): Promise<CaptureRow[]> {
  const { data, error } = await live(supabase, f, "id,ts,cls,peak_mv,flagged").order("ts", { ascending: false }).limit(limit);
  return error ? [] : ((data ?? []) as unknown as CaptureRow[]);
}

// Hide specific captures.
export async function deleteIds(supabase: SupabaseClient, plantId: string, ids: number[]): Promise<DeleteOutcome> {
  let count = 0;
  const hidden: number[] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_CALL) {
    const chunk = ids.slice(i, i + IDS_PER_CALL);
    const { data, error } = await supabase.rpc("soft_delete_captures", { ids: chunk });
    if (error) return { count, undo: hidden.length ? { plantId, ids: hidden } : null, failed: true };
    const n = Number((data as { count?: number } | null)?.count ?? 0);
    count += n;
    if (n) hidden.push(...chunk);
  }
  // Asked to hide something and nothing went: not permitted, or already gone.
  return { count, undo: count ? { plantId, ids: hidden } : null, failed: ids.length > 0 && count === 0 };
}

// Hide everything matching the filter, in one statement (the flood case).
export async function deleteMatching(supabase: SupabaseClient, f: CaptureFilter): Promise<DeleteOutcome> {
  const { data, error } = await supabase.rpc("soft_delete_captures_matching", {
    target_plant: f.plantId, from_ts: f.from, to_ts: f.to, include_flagged: f.includeFlagged,
  });
  if (error) return { count: 0, undo: null, failed: true };
  const r = data as { count?: number; at?: string } | null;
  const count = Number(r?.count ?? 0);
  return { count, undo: count && r?.at ? { plantId: f.plantId, at: r.at } : null, failed: false };
}

export async function restore(supabase: SupabaseClient, plantId: string, opts: { ids?: number[]; at?: string } = {}): Promise<number | null> {
  const { data, error } = await supabase.rpc("restore_captures", {
    target_plant: plantId, ids: opts.ids ?? null, at_ts: opts.at ?? null,
  });
  return error ? null : Number(data ?? 0);
}

export const undo = (supabase: SupabaseClient, t: UndoToken) => restore(supabase, t.plantId, { ids: t.ids, at: t.at });

export async function listDeleted(supabase: SupabaseClient, plantId: string, max = 200): Promise<DeletedRow[] | null> {
  const { data, error } = await supabase.rpc("list_deleted_captures", { target_plant: plantId, max_rows: max });
  return error ? null : ((data ?? []) as DeletedRow[]);
}

// Remove for good: the rows (in SQL) and then their waveform files (Storage, which SQL cannot
// touch). Files are removed after the rows, so a failure between the two leaves an invisible
// orphaned file, never a visible capture that lost its waveform.
export async function purge(
  supabase: SupabaseClient, plantId: string, opts: { ids?: number[]; onlyExpired?: boolean } = {},
): Promise<{ purged: number; filesLeft: number; failed: boolean }> {
  const { data, error } = await supabase.rpc("purge_captures", {
    target_plant: plantId, ids: opts.ids ?? null, only_expired: opts.onlyExpired ?? false,
  });
  if (error) return { purged: 0, filesLeft: 0, failed: true };
  const paths = ((data ?? []) as { full_path: string }[]).map((r) => r.full_path);
  let filesLeft = 0;
  for (let i = 0; i < paths.length; i += FILES_PER_CALL) {
    const chunk = paths.slice(i, i + FILES_PER_CALL);
    const { error: fileError } = await supabase.storage.from(BUCKET).remove(chunk);
    if (fileError) filesLeft += chunk.length;
  }
  return { purged: paths.length, filesLeft, failed: false };
}
