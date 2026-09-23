"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ScopeCommand, ScopeCommandKind, ScopeState } from "@/lib/types";
import { isOpen } from "./scope-control";

const POLL_MS = 10_000;
const POLL_BUSY_MS = 2_000;
const COMMANDS = 8;

// Reads what the lab PC last reported and the recent command queue, and queues new commands.
// The dashboard never talks to the scope: the PC picks commands up on its next call (about 5 s)
// and reports back. Polls every 2 s while a command is open, every 10 s otherwise.
export function useScopeControl(plantId: string, enabled: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<ScopeState | null>(null);
  const [commands, setCommands] = useState<ScopeCommand[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([
      supabase.from("scope_state").select("*").eq("plant_id", plantId).maybeSingle(),
      supabase.from("scope_commands").select("id,plant_id,kind,payload,status,result,created_at,finished_at")
        .eq("plant_id", plantId).order("id", { ascending: false }).limit(COMMANDS),
    ]);
    if (s.error || c.error) { setFailed(true); setLoaded(true); return; }
    setFailed(false);
    setState((s.data as ScopeState | null) ?? null);
    const list = (c.data ?? []) as ScopeCommand[];
    busy.current = list.some(isOpen);
    setCommands(list);
    setLoaded(true);
  }, [supabase, plantId]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await load();
      if (alive) timer = setTimeout(tick, busy.current ? POLL_BUSY_MS : POLL_MS);
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [enabled, load]);

  // Returns an error code, or null when the command is queued.
  const send = useCallback(async (kind: ScopeCommandKind, payload: Record<string, unknown>) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return "auth" as const;
    const { error } = await supabase.from("scope_commands")
      .insert({ plant_id: plantId, kind, payload, created_by: u.user.id });
    if (error) return (error.message.includes("too_many_open_scope_commands") ? "busy" : "failed") as "busy" | "failed";
    busy.current = true;
    await load();
    return null;
  }, [supabase, plantId, load]);

  return { state, commands, loaded, failed, send, reload: load };
}
