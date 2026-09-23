"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Calendar days (local time zone) that have cavitation captures for a plant, as dayKey()
// strings, so the Stress events day picker can enable them. `refreshKey` re-fetches when the
// capture count changes (new captures arriving, or some deleted).
export function useCaptureDays(supabase: SupabaseClient, plantId: string, refreshKey: unknown) {
  const [days, setDays] = useState<Set<string> | null>(null);

  useEffect(() => {
    let alive = true;
    let tz = "UTC";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch {}
    supabase.rpc("capture_days", { target_plant: plantId, tz }).then(({ data, error }) => {
      if (!alive || error) return;
      const keys = ((data ?? []) as { day: string }[]).map(({ day }) => day.split("-").map(Number).join("-"));
      setDays(new Set(keys));
    });
    return () => { alive = false; };
  }, [supabase, plantId, refreshKey]);

  return days;
}
