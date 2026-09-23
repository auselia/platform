import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteIds, deleteMatching, type CaptureFilter } from "./cavitation-delete";

// A tiny in-memory stand-in for the two Supabase calls the engine makes. `allowed: false`
// mimics RLS refusing the delete (PostgREST returns no rows, not an error).
function fake(opts: { ids: number[]; allowed?: boolean; deleteError?: boolean; storageError?: boolean }) {
  const rows = new Map(opts.ids.map((id) => [id, `plant/${id}.bin.gz`]));
  const removed: string[] = [];
  const deleteCalls: number[][] = [];
  const client = {
    from: () => ({
      select: () => {
        const q = {
          eq: () => q, gte: () => q, lte: () => q, order: () => q,
          limit: (n: number) => Promise.resolve({ data: [...rows.keys()].slice(0, n).map((id) => ({ id })), error: null }),
        };
        return q;
      },
      delete: () => ({
        in: (_col: string, ids: number[]) => ({
          select: () => {
            deleteCalls.push(ids);
            if (opts.deleteError) return Promise.resolve({ data: null, error: { message: "boom" } });
            const gone = opts.allowed === false ? [] : ids.filter((id) => rows.delete(id));
            return Promise.resolve({ data: gone.map((id) => ({ id, full_path: `plant/${id}.bin.gz` })), error: null });
          },
        }),
      }),
    }),
    storage: {
      from: () => ({
        remove: (paths: string[]) => {
          if (opts.storageError) return Promise.resolve({ error: { message: "nope" } });
          removed.push(...paths);
          return Promise.resolve({ error: null });
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, removed, deleteCalls, remaining: () => rows.size };
}

const filter: CaptureFilter = { plantId: "p", from: null, to: null, includeFlagged: false };
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("deleteIds", () => {
  it("deletes in batches of 100 and removes each waveform file", async () => {
    const f = fake({ ids: range(250) });
    const r = await deleteIds(f.client, range(250));
    expect(r).toMatchObject({ deleted: 250, filesLeft: 0, failed: false });
    expect(f.deleteCalls.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(f.removed).toHaveLength(250);
  });

  it("reports failure when nothing was deleted (not permitted)", async () => {
    const f = fake({ ids: range(5), allowed: false });
    const r = await deleteIds(f.client, range(5));
    expect(r).toMatchObject({ deleted: 0, failed: true });
    expect(f.removed).toHaveLength(0);
  });

  it("stops on a database error", async () => {
    const r = await deleteIds(fake({ ids: range(5), deleteError: true }).client, range(5));
    expect(r.failed).toBe(true);
  });

  it("counts waveform files that could not be removed, without failing the delete", async () => {
    const r = await deleteIds(fake({ ids: range(3), storageError: true }).client, range(3));
    expect(r).toMatchObject({ deleted: 3, filesLeft: 3, failed: false });
  });
});

describe("deleteMatching", () => {
  it("keeps going across pages until nothing matches", async () => {
    const f = fake({ ids: range(1200) });
    const seen: number[] = [];
    const r = await deleteMatching(f.client, filter, (n) => seen.push(n), () => false);
    expect(r).toMatchObject({ deleted: 1200, failed: false, stopped: false });
    expect(f.remaining()).toBe(0);
    expect(seen[seen.length - 1]).toBe(1200);
  });

  it("does not loop forever when deletes are refused", async () => {
    const f = fake({ ids: range(600), allowed: false });
    const r = await deleteMatching(f.client, filter, () => {}, () => false);
    expect(r).toMatchObject({ deleted: 0, failed: true });
    expect(f.deleteCalls.length).toBeLessThanOrEqual(5);
  });

  it("can be stopped between pages", async () => {
    const f = fake({ ids: range(1200) });
    let pages = 0;
    const r = await deleteMatching(f.client, filter, () => { pages++; }, () => pages >= 5);
    expect(r.stopped).toBe(true);
    expect(f.remaining()).toBeGreaterThan(0);
  });
});
