"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Cavitation, CavitationSummary } from "@/lib/types";
import type { Range } from "./env";

const PAGE = 40;
const POLL_MS = 20_000;
const DAY_MS = 86_400_000;
// A day-scoped window can't page "older" the way the default latest-N view can (the window
// is already bounded), so it just fetches everything in range up to this cap instead.
const RANGE_CAP = 500;
// Everything except the trace: the list stays light and the trace loads on demand.
const COLS =
  "id,plant_id,capture_key,ts,cls,level_mv,peak_mv,snr,dur_us,swings,freq_khz,clipped,t0_us,t1_us,ev0_us,ev1_us,flagged,flag_note,full_path,scale";

export type CavitationFilter = "all" | "flagged";

// Shared capture-fetching logic behind both the classic Cavitations tab and the focus-mode
// grid. With no dayAnchor it behaves like the classic tab: latest PAGE captures, "older"
// pages further back. With a dayAnchor it instead fetches everything inside the day/week/
// month window ending at that day, so the caller can browse a specific point in time.
export function useCavitationData(plantId: string, dayAnchor: Date | null, range: Range) {
  const supabase = useMemo(() => createClient(), []);

  const [items, setItems] = useState<Cavitation[]>([]);
  const [summary, setSummary] = useState<CavitationSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<CavitationFilter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [traces, setTraces] = useState<Record<number, number[]>>({});
  const traceAsked = useRef(new Set<number>());

  const load = useCallback(async () => {
    const base = supabase.from("cavitation_captures").select(COLS).eq("plant_id", plantId);
    const listQuery = dayAnchor
      ? base
          .gte("ts", new Date(dayAnchor.getTime() - (range === "day" ? DAY_MS : range === "week" ? 7 * DAY_MS : 30 * DAY_MS) + 1).toISOString())
          .lte("ts", dayAnchor.toISOString())
          .order("ts", { ascending: false }).limit(RANGE_CAP)
      : base.order("ts", { ascending: false }).limit(PAGE);
    const [list, sum] = await Promise.all([
      listQuery,
      supabase.from("cavitation_summary").select("*").eq("plant_id", plantId).maybeSingle(),
    ]);
    if (list.error || sum.error) { setFailed(true); setLoaded(true); return; }
    setFailed(false);
    const fresh = (list.data ?? []) as Cavitation[];
    if (dayAnchor) {
      // The whole window is refetched each poll, there is no separate "older" page to keep.
      setItems(fresh);
      setHasMore(false);
    } else {
      // Merge: keep older pages already loaded, replace the newest page with fresh data.
      setItems((old) => {
        const seen = new Set(fresh.map((x) => x.id));
        const oldest = fresh.length ? fresh[fresh.length - 1].ts : "";
        const kept = old.filter((x) => !seen.has(x.id) && x.ts < oldest);
        return [...fresh, ...kept];
      });
      setHasMore((prev) => (prev && !fresh.length ? prev : fresh.length === PAGE || prev));
    }
    setSummary((sum.data as CavitationSummary | null) ?? null);
    setLoaded(true);
  }, [supabase, plantId, dayAnchor, range]);

  useEffect(() => {
    let alive = true;
    // A background tab shouldn't keep pulling up to 500 rows every 20 s; refresh once when it's shown again.
    const run = () => { if (alive && !document.hidden) void load(); };
    run();
    const id = setInterval(run, POLL_MS);
    document.addEventListener("visibilitychange", run);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", run); };
  }, [load]);

  const older = async () => {
    if (dayAnchor) return;
    const last = items[items.length - 1];
    if (!last) return;
    const r = await supabase.from("cavitation_captures").select(COLS).eq("plant_id", plantId)
      .lt("ts", last.ts).order("ts", { ascending: false }).limit(PAGE);
    if (r.error) return;
    const more = (r.data ?? []) as Cavitation[];
    setItems((old) => [...old, ...more]);
    setHasMore(more.length === PAGE);
  };

  const visible = useMemo(() => (filter === "flagged" ? items.filter((x) => x.flagged) : items), [items, filter]);
  const selected = visible.find((x) => x.id === selectedId) ?? visible[0] ?? null;
  const selId = selected?.id ?? null;

  useEffect(() => {
    if (selId === null || traceAsked.current.has(selId)) return;
    traceAsked.current.add(selId);
    supabase.from("cavitation_captures").select("y").eq("id", selId).maybeSingle().then(({ data }) => {
      if (data?.y) setTraces((tr) => ({ ...tr, [selId]: data.y as number[] }));
      else traceAsked.current.delete(selId);
    });
  }, [supabase, selId]);

  const saveFlag = async (c: Cavitation, flagged: boolean, note: string) => {
    const patch = { flagged, flag_note: flagged ? note : "", flagged_at: flagged ? new Date().toISOString() : null };
    const { error } = await supabase.from("cavitation_captures").update(patch).eq("id", c.id);
    if (error) return false;
    setItems((all) => all.map((x) => (x.id === c.id ? { ...x, flagged, flag_note: patch.flag_note } : x)));
    void load();
    return true;
  };

  return {
    supabase: supabase as SupabaseClient,
    items, summary, loaded, failed, hasMore,
    filter, setFilter, visible,
    selectedId, setSelectedId, selected,
    traces, older, saveFlag, reload: load,
  };
}
