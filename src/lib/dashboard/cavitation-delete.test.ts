import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteIds, deleteMatching, listDeleted, purge, restore, undo, type CaptureFilter } from "./cavitation-delete";

type Reply = { data?: unknown; error?: { message: string } | null };
type Call = { fn: string; args: Record<string, unknown> };

// A stand-in for the two Supabase surfaces the engine touches: rpc() and storage remove().
function fake(handler: (fn: string, args: Record<string, unknown>, n: number) => Reply, opts: { storageError?: boolean } = {}) {
  const calls: Call[] = [];
  const removed: string[][] = [];
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const r = handler(fn, args, calls.length);
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
    storage: {
      from: () => ({
        remove: (paths: string[]) => {
          removed.push(paths);
          return Promise.resolve({ error: opts.storageError ? { message: "nope" } : null });
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, calls, removed };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const filter: CaptureFilter = { plantId: "p", from: "2026-09-23T00:00:00Z", to: null, includeFlagged: false };

describe("deleteIds (hide)", () => {
  it("calls the hide function in chunks of 500 and adds up the counts", async () => {
    const f = fake((_fn, args) => ({ data: { count: (args.ids as number[]).length, at: "t" } }));
    const o = await deleteIds(f.client, "p", range(1200));
    expect(f.calls.map((c) => (c.args.ids as number[]).length)).toEqual([500, 500, 200]);
    expect(o).toMatchObject({ count: 1200, failed: false });
    expect(o.undo).toEqual({ plantId: "p", ids: range(1200) });
  });

  it("fails, with nothing to undo, when nothing was hidden (not permitted or already gone)", async () => {
    const f = fake(() => ({ data: { count: 0, at: "t" } }));
    expect(await deleteIds(f.client, "p", [1, 2])).toEqual({ count: 0, undo: null, failed: true });
  });

  it("keeps what was hidden before an error so it can still be undone", async () => {
    const f = fake((_fn, _a, n) => (n === 1 ? { data: { count: 500, at: "t" } } : { error: { message: "boom" } }));
    const o = await deleteIds(f.client, "p", range(700));
    expect(o.failed).toBe(true);
    expect(o.count).toBe(500);
    expect(o.undo?.ids).toHaveLength(500);
  });
});

describe("deleteMatching (the flood case)", () => {
  it("hides everything matching in one call and returns the timestamp Undo needs", async () => {
    const f = fake(() => ({ data: { count: 1284, at: "2026-09-23T22:13:01.986334+00:00" } }));
    const o = await deleteMatching(f.client, filter);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toEqual({
      fn: "soft_delete_captures_matching",
      args: { target_plant: "p", from_ts: "2026-09-23T00:00:00Z", to_ts: null, include_flagged: false },
    });
    expect(o).toEqual({ count: 1284, undo: { plantId: "p", at: "2026-09-23T22:13:01.986334+00:00" }, failed: false });
  });

  it("has nothing to undo when nothing matched, and reports a database error", async () => {
    expect((await deleteMatching(fake(() => ({ data: { count: 0, at: "t" } })).client, filter)).undo).toBeNull();
    expect((await deleteMatching(fake(() => ({ error: { message: "x" } })).client, filter)).failed).toBe(true);
  });
});

describe("restore and undo", () => {
  it("undo by ids and by timestamp send the right parameters", async () => {
    const f = fake(() => ({ data: 3 }));
    expect(await undo(f.client, { plantId: "p", ids: [1, 2, 3] })).toBe(3);
    expect(await undo(f.client, { plantId: "p", at: "T" })).toBe(3);
    expect(f.calls[0].args).toEqual({ target_plant: "p", ids: [1, 2, 3], at_ts: null });
    expect(f.calls[1].args).toEqual({ target_plant: "p", ids: null, at_ts: "T" });
  });

  it("restore with no options brings back everything, and reports failure as null", async () => {
    const f = fake(() => ({ data: 7 }));
    expect(await restore(f.client, "p")).toBe(7);
    expect(f.calls[0].args).toEqual({ target_plant: "p", ids: null, at_ts: null });
    expect(await restore(fake(() => ({ error: { message: "x" } })).client, "p")).toBeNull();
  });
});

describe("listDeleted", () => {
  it("returns null on error so the panel can say it failed instead of showing an empty list", async () => {
    expect(await listDeleted(fake(() => ({ error: { message: "x" } })).client, "p")).toBeNull();
  });
});

describe("purge (remove for good)", () => {
  const paths = (n: number) => range(n).map((i) => ({ full_path: `p/${i}.bin.gz` }));

  it("removes the rows in SQL, then the waveform files in batches of 100", async () => {
    const f = fake(() => ({ data: paths(250) }));
    const r = await purge(f.client, "p", { onlyExpired: true });
    expect(f.calls[0].args).toEqual({ target_plant: "p", ids: null, only_expired: true });
    expect(f.removed.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(r).toEqual({ purged: 250, filesLeft: 0, failed: false });
  });

  it("counts files that could not be removed without failing the purge", async () => {
    const f = fake(() => ({ data: paths(3) }), { storageError: true });
    expect(await purge(f.client, "p")).toEqual({ purged: 3, filesLeft: 3, failed: false });
  });

  it("does not touch Storage when the database call fails", async () => {
    const f = fake(() => ({ error: { message: "x" } }));
    expect(await purge(f.client, "p")).toMatchObject({ failed: true, purged: 0 });
    expect(f.removed).toHaveLength(0);
  });
});
