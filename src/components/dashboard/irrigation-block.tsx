"use client";

import { useState } from "react";
import type { IrrigationConfig } from "@/lib/types";
import type { Strings } from "@/lib/dashboard/i18n";
import { relTime } from "./ui";

const pad2 = (n: number) => String(n).padStart(2, "0");

export type IrrigationPayload = {
  hour1: number; min1: number; hour2: number; min2: number; duration_min: number; enabled: boolean;
};

export default function IrrigationBlock({
  config, t, onSave, canEdit,
}: {
  config: IrrigationConfig | null;
  t: Strings;
  onSave: (p: IrrigationPayload) => Promise<boolean>;
  canEdit: boolean;
}) {
  const c = config ?? { hour1: 8, min1: 0, hour2: 18, min2: 0, duration_min: 5, enabled: true, updated_at: null };
  const [enabled, setEnabled] = useState(c.enabled);
  const [t1, setT1] = useState(`${pad2(c.hour1)}:${pad2(c.min1)}`);
  const [t2, setT2] = useState(`${pad2(c.hour2)}:${pad2(c.min2)}`);
  const [dur, setDur] = useState(String(c.duration_min));
  const [status, setStatus] = useState("");

  const updated = config?.updated_at ? `${t.scheduleUpdated} ${relTime(new Date(config.updated_at), t)}` : t.scheduleDefault;

  async function save() {
    const d = parseInt(dur, 10);
    if (!t1 || !t2 || Number.isNaN(d)) { setStatus(t.saveFailed); return; }
    const [h1, m1] = t1.split(":").map(Number);
    const [h2, m2] = t2.split(":").map(Number);
    setStatus(t.saving);
    const ok = await onSave({ hour1: h1, min1: m1, hour2: h2, min2: m2, duration_min: d, enabled });
    setStatus(ok ? "" : t.saveFailed);
  }

  const field = "w-full rounded-lg border-[1.5px] border-border bg-surface px-[9px] py-[7px] font-mono text-[13px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-45";
  const label = "text-[10px] uppercase tracking-[0.04em] text-ink2";

  return (
    <div className="mt-3.5 border-t border-border pt-3.5">
      <div className="mb-2 text-[10.5px] uppercase tracking-[0.04em] text-ink2">{t.irrigationTitle}</div>
      <div className="mb-3.5 flex items-center gap-2.5">
        <label className="relative inline-block h-[22px] w-10 flex-none">
          <input
            type="checkbox" checked={enabled} disabled={!canEdit} onChange={(e) => setEnabled(e.target.checked)}
            className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          <span className="pointer-events-none absolute inset-0 rounded-full bg-border transition-colors peer-checked:bg-status-ok peer-disabled:opacity-45" />
          <span className="pointer-events-none absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-surface shadow transition-transform peer-checked:translate-x-[18px]" />
        </label>
        <span className="font-mono text-xs font-bold uppercase tracking-[0.04em] text-ink">
          {enabled ? t.irrOn : t.irrOff}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5">
        <div className="flex flex-col gap-[5px]">
          <label className={label}>{t.irrMorning}</label>
          <input type="time" value={t1} disabled={!canEdit || !enabled} onChange={(e) => setT1(e.target.value)} className={field} />
        </div>
        <div className="flex flex-col gap-[5px]">
          <label className={label}>{t.irrAfternoon}</label>
          <input type="time" value={t2} disabled={!canEdit || !enabled} onChange={(e) => setT2(e.target.value)} className={field} />
        </div>
        <div className="flex flex-col gap-[5px]">
          <label className={label}>{t.irrDuration}</label>
          <input type="number" min={0} max={60} value={dur} disabled={!canEdit || !enabled} onChange={(e) => setDur(e.target.value)} className={field} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {canEdit ? (
          <>
            <button onClick={save} className="rounded-lg bg-amber px-4 py-2 text-[13px] font-semibold text-forest">
              {t.irrSave}
            </button>
            <span className="text-[11px] text-ink2">{status || updated}</span>
          </>
        ) : (
          <span className="text-[11px] text-ink2">{t.irrViewOnly}</span>
        )}
      </div>
    </div>
  );
}
