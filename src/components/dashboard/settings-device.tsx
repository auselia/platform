"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeviceLog, DeviceLogLevel, Reading, Role } from "@/lib/types";
import type { Strings } from "@/lib/dashboard/i18n";
import { formatUptime, wifiQuality } from "@/lib/dashboard/firmware";
import FirmwarePanel from "./firmware-panel";
import { Segmented, relTime } from "./ui";
import { fill } from "./capture-delete-dialogs";

const POLL_MS = 30_000;
const LOG_LIMIT = 100;
const RECENT_RESTART_MS = 65 * 60 * 1000;

const LEVEL_STYLE: Record<DeviceLogLevel, string> = {
  event: "border-border text-ink2",
  warning: "border-status-stress/60 bg-status-stress/10 text-ink",
  error: "border-status-critical/60 bg-status-critical/10 text-status-critical",
};

// Settings > Device (live plants only): what the device reports about itself. The status cards
// come from the diagnostics that ride along on the newest hourly reading, the log from the batches
// the device flushes every few minutes. Neither is a live feed.
export default function SettingsDevice({
  supabase, plantId, rows, role, t, locale,
}: {
  supabase: SupabaseClient; plantId: string; rows: Reading[]; role: Role | null; t: Strings; locale: string | undefined;
}) {
  const [logs, setLogs] = useState<DeviceLog[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<"all" | "problems">("all");

  useEffect(() => {
    let alive = true;
    const load = () => supabase.from("device_logs").select("id,uptime_ms,level,message,created_at")
      .eq("plant_id", plantId).order("id", { ascending: false }).limit(LOG_LIMIT)
      .then(({ data, error }) => {
        if (!alive) return;
        setFailed(!!error);
        if (!error) setLogs((data ?? []) as DeviceLog[]);
      });
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [supabase, plantId]);

  // Newest reading that carries any diagnostics (older firmware sends none).
  const diag = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.wifi_rssi != null || r.free_heap != null || r.uptime_ms != null || r.soil_raw != null) return r;
    }
    return null;
  }, [rows]);
  const lastRow = rows.length ? rows[rows.length - 1] : null;

  const wifiLabel = (rssi: number) => ({
    excellent: t.devWifiExcellent, good: t.devWifiGood, fair: t.devWifiFair, weak: t.devWifiWeak,
  })[wifiQuality(rssi)];
  const levelLabel = (l: DeviceLogLevel) => (l === "event" ? t.devLevelEvent : l === "warning" ? t.devLevelWarning : t.devLevelError);

  const cards: [string, string, boolean?][] = [
    [t.devLastUpload, lastRow ? relTime(new Date(lastRow.ts), t) : "-"],
  ];
  if (diag) {
    if (diag.wifi_rssi != null) cards.push([t.devWifi, `${wifiLabel(diag.wifi_rssi)} (${diag.wifi_rssi} dBm)`, wifiQuality(diag.wifi_rssi) === "weak"]);
    if (diag.free_heap != null) cards.push([t.devMemory, `${Math.round(diag.free_heap / 1024)} KB`]);
    if (diag.uptime_ms != null) cards.push([t.devUptime, formatUptime(diag.uptime_ms), diag.uptime_ms < RECENT_RESTART_MS]);
    if (diag.soil_raw != null) cards.push([t.devSoilRaw, String(diag.soil_raw)]);
  }

  const shown = (logs ?? []).filter((l) => filter === "all" || l.level !== "event");

  return (
    <div className="flex flex-col gap-3.5">
      <section>
        <div className="mb-2 text-[10.5px] uppercase tracking-[0.04em] text-ink2">{t.devStatus}</div>
        <div className="grid grid-cols-2 gap-2.5">
          {cards.map(([k, v, warn]) => (
            <div key={k} className="rounded-lg border border-border px-3.5 py-2.5">
              <div className="text-[9.5px] uppercase tracking-[0.04em] text-ink2">{k}</div>
              <div className={`mt-0.5 font-mono text-[13px] font-semibold ${warn ? "text-status-stress" : ""}`}>{v}</div>
              {warn && k === t.devUptime && <div className="mt-0.5 text-[10.5px] text-ink2">{t.devJustRestarted}</div>}
            </div>
          ))}
        </div>
        {!diag && <p className="mt-2 text-[11.5px] text-ink2">{t.devNoDiag}</p>}
      </section>

      <section>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10.5px] uppercase tracking-[0.04em] text-ink2">{t.devLogTitle}</div>
          <Segmented
            value={filter} onChange={setFilter}
            options={[{ value: "all", label: t.devLogAll }, { value: "problems", label: t.devLogProblems }]}
          />
        </div>
        <p className="mb-2 text-[11.5px] text-ink2">{t.devLogHint}</p>
        {failed && !logs ? (
          <div className="text-xs text-status-critical">{t.devLogFailed}</div>
        ) : !logs ? (
          <div className="text-xs text-ink2">{t.loading}…</div>
        ) : shown.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-border px-3.5 py-6 text-center text-[12.5px] text-ink2">
            {filter === "all" ? t.devLogNone : t.devLogNoneProblems}
          </div>
        ) : (
          <ul className="m-0 max-h-80 list-none overflow-y-auto rounded-lg border border-border p-0">
            {shown.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-border/60 px-3 py-1.5 text-xs last:border-b-0">
                <span className="w-16 flex-none text-ink2" title={new Date(l.created_at).toLocaleString(locale)}>{relTime(new Date(l.created_at), t)}</span>
                <span className={`flex-none rounded-full border px-2 py-px font-mono text-[10px] font-semibold uppercase tracking-[0.03em] ${LEVEL_STYLE[l.level]}`}>
                  {levelLabel(l.level)}
                </span>
                <span className="min-w-0 flex-1 break-words">{l.message}</span>
                <span className="flex-none font-mono text-[10.5px] text-ink2">{fill(t.devLogUp, { x: formatUptime(l.uptime_ms) })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {role === "owner" && <FirmwarePanel supabase={supabase} plantId={plantId} t={t} />}
    </div>
  );
}
