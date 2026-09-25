"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeviceLog, IrrigationConfig } from "@/lib/types";
import type { Strings } from "@/lib/dashboard/i18n";
import { Modal, danger, fill, quiet } from "./capture-delete-dialogs";
import { relTime } from "./ui";

// Mirrors MANUAL_COMMAND_TTL_MS in supabase/functions/_shared/device-config.ts: the backend stops
// advertising an "on" command after this long, so past it the device will not act on it.
const COMMAND_WINDOW_MS = 6 * 60 * 1000;

// Runs the pump outside the schedule. Editors and Owners only (the caller decides). The device
// polls every 5 minutes, so this says "sent" rather than "running": the device's own log is the
// only real proof that the pump is on, and the last pump event from it is shown below.
export default function ManualPump({
  supabase, plantId, config, t, onChanged,
}: {
  supabase: SupabaseClient; plantId: string; config: IrrigationConfig | null; t: Strings;
  onChanged: (c: IrrigationConfig) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [last, setLast] = useState<DeviceLog | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.from("device_logs").select("id,uptime_ms,level,message,created_at")
      .eq("plant_id", plantId).ilike("message", "pump%").order("id", { ascending: false }).limit(1)
      .then(({ data }) => { if (alive) setLast(((data ?? [])[0] as DeviceLog | undefined) ?? null); });
    return () => { alive = false; };
  }, [supabase, plantId, config?.manual_command_at]);

  const on = !!config?.manual_pump_on;
  const at = config?.manual_command_at ? Date.parse(config.manual_command_at) : null;
  const fresh = at !== null && now - at < COMMAND_WINDOW_MS;
  const scheduleOff = config?.enabled === false;

  async function send(value: boolean) {
    setBusy(true);
    setError(false);
    const { data, error: err } = await supabase
      .from("irrigation_config")
      .upsert({ plant_id: plantId, manual_pump_on: value }, { onConflict: "plant_id" })
      .select().single();
    setBusy(false);
    setConfirming(false);
    if (err || !data) { setError(true); return; }
    setNow(Date.now());
    onChanged(data as IrrigationConfig);
  }

  const status = error ? t.mpFailed
    : on && fresh ? t.mpWaiting
    : on && !fresh ? t.mpExpired
    : at !== null && fresh ? t.mpStopSent
    : "";

  return (
    <div className="mt-3.5 border-t border-border pt-3.5">
      <div className="mb-1 text-[10.5px] uppercase tracking-[0.04em] text-ink2">{t.mpTitle}</div>
      <p className="mb-2.5 text-[11.5px] text-ink2">{t.mpHint}</p>
      <div className="flex flex-wrap items-center gap-2.5">
        {on && fresh ? (
          <button onClick={() => send(false)} disabled={busy} className={quiet}>{t.mpStop}</button>
        ) : (
          <button
            onClick={() => setConfirming(true)} disabled={busy || scheduleOff}
            className="rounded-lg bg-amber px-4 py-2 text-[13px] font-semibold text-forest disabled:opacity-45"
          >
            {t.mpRun}
          </button>
        )}
        {scheduleOff && <span className="text-[11px] text-ink2">{t.mpDisabled}</span>}
      </div>
      {status && <p className={`mt-2 text-[11.5px] ${error || (on && !fresh) ? "text-status-critical" : "text-ink2"}`}>{status}</p>}
      {last && (
        <p className="mt-1.5 text-[11.5px] text-ink2">
          {fill(t.mpLastEvent, { msg: last.message })} ({relTime(new Date(last.created_at), t)})
        </p>
      )}

      {confirming && (
        <Modal onClose={() => setConfirming(false)} locked={busy}>
          <h3 className="m-0 font-[family-name:var(--font-display)] text-[17px] font-semibold">{t.mpConfirmTitle}</h3>
          <p className="mt-2 text-[12.5px] text-ink">{t.mpConfirmBody}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirming(false)} disabled={busy} autoFocus className={quiet}>{t.cancel}</button>
            <button onClick={() => send(true)} disabled={busy} className={danger}>{t.mpConfirmBtn}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
