"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ScopeCommand, ScopeSettingSpec, ScopeState } from "@/lib/types";
import type { Strings } from "@/lib/dashboard/i18n";
import {
  buildChanges, cleanSnapshotName, errorText, groupSpec, isOpen, pcAgeSeconds, pcOnline, toDisplay, type Edit, type Edits,
} from "@/lib/dashboard/scope-control";
import { useScopeControl } from "@/lib/dashboard/use-scope-control";
import { StatusPill, relTime } from "./ui";

const btn = "rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent";
const primary = "rounded-lg bg-amber px-3.5 py-2 text-xs font-semibold text-forest disabled:opacity-50";
const field = "w-full rounded-md border border-border bg-transparent px-2 py-1 font-mono text-xs text-ink disabled:opacity-60";
const OPEN_GROUPS = new Set(["Trigger", "Timebase", "Acquisition"]);

// Oscilloscope settings, generated from the spec the lab PC reports. The dashboard never reaches the
// scope: a change becomes a queued command that the PC picks up, checks and runs.
export default function ScopeSettings({
  plantId, canEdit, t,
}: { plantId: string; canEdit: boolean; t: Strings }) {
  const sc = useScopeControl(plantId, true);
  const { state, commands } = sc;
  const [edits, setEdits] = useState<Edits>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [snapName, setSnapName] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(id); }, []);

  const online = pcOnline(state?.updated_at, now);
  const open = commands.some(isOpen);
  const usable = canEdit && online && !open && !!state?.settings;
  const lastApply = commands.find((c) => c.kind === "settings_apply") ?? null;

  // A settings command that finished: the PC has reported the new values, so the edits are no longer needed.
  const cleared = useRef<number | null>(null);
  useEffect(() => {
    if (lastApply && lastApply.status === "done" && cleared.current !== lastApply.id) {
      cleared.current = lastApply.id;
      setEdits({});
    }
  }, [lastApply]);

  const spec = useMemo(() => state?.spec ?? [], [state]);
  const current = useMemo(() => state?.settings ?? {}, [state]);
  const { changes, errors } = useMemo(() => buildChanges(spec, current, edits), [spec, current, edits]);
  const nChanges = Object.keys(changes).length;

  const send = async (kind: Parameters<typeof sc.send>[0], payload: Record<string, unknown>) => {
    setMsg(null);
    const err = await sc.send(kind, payload);
    if (err) setMsg(err === "busy" ? t.scBusy : t.scSendFailed);
    return !err;
  };

  if (!sc.loaded) return <div className="text-xs text-ink2">{t.loading}…</div>;
  if (!state) return <Notice text={t.scNoState} />;

  const age = pcAgeSeconds(state.updated_at, now);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h3 className="text-[13px] font-semibold">{t.scTitle}</h3>
        <StatusPill status={online ? "good" : "idle"} t={{ ...t, statusGood: t.scPcOnline, statusNoData: t.scPcOffline }} />
        <span className="font-mono text-[11px] text-ink2">{t.scLastReport}: {relTime(new Date(state.updated_at), t)}{age !== null && age < 60 ? ` (${age} s)` : ""}</span>
      </div>

      {!online && <Notice text={t.scOfflineHint} />}
      {online && !canEdit && <Notice text={t.scViewerOnly} />}
      {state.scope_error && <Notice level="critical" text={`${t.scScopeError} ${state.scope_error}`} />}
      {state.drift.length > 0 && (
        <Notice level="warning" text={`${t.scDrift}: ${state.drift.slice(0, 3).map((d) => `${d.label} ${d.have} (${d.want})`).join(", ")}`} />
      )}
      {(state.logger.alerts ?? []).length > 0 && (
        <div className="rounded-lg border border-border px-3.5 py-2.5">
          <div className="text-[9.5px] uppercase tracking-[0.04em] text-ink2">{t.scNotices}</div>
          <ul className="mt-1 flex flex-col gap-0.5 text-[12px]">
            {(state.logger.alerts ?? []).map((a) => <li key={a.id}>{a.text}</li>)}
          </ul>
        </div>
      )}

      {state.settings && (
        <>
          <div className="flex flex-col gap-2">
            {groupSpec(spec).map(({ group, items }) => (
              <details key={group} open={OPEN_GROUPS.has(group)} className="rounded-lg border border-border">
                <summary className="cursor-pointer px-3.5 py-2 text-[12px] font-semibold">{group}</summary>
                <div className="grid grid-cols-1 gap-2.5 px-3.5 pb-3 sm:grid-cols-2">
                  {items.map((s) => (
                    <SettingField
                      key={s.id} s={s} t={t} disabled={!usable}
                      value={s.id in edits ? edits[s.id] : toDisplay(s, current[s.id])}
                      dirty={s.id in changes} error={errors[s.id]}
                      onChange={(v) => setEdits((e) => ({ ...e, [s.id]: v }))}
                    />
                  ))}
                </div>
              </details>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className={primary} disabled={!usable || nChanges === 0 || Object.keys(errors).length > 0}
              onClick={() => void send("settings_apply", { changes })}>{t.scApply}</button>
            <button className={btn} disabled={Object.keys(edits).length === 0} onClick={() => setEdits({})}>{t.scDiscard}</button>
            <CommandStatus c={lastApply} t={t} />
            {msg && <span className="text-xs text-status-critical">{msg}</span>}
          </div>
        </>
      )}

      <Snapshots
        state={state} commands={commands} t={t} usable={usable} snapName={snapName} setSnapName={setSnapName}
        confirm={confirm} setConfirm={setConfirm} send={send}
      />
    </div>
  );
}

function Notice({ text, level }: { text: string; level?: "warning" | "critical" }) {
  const color = level === "critical" ? "var(--status-critical)" : level === "warning" ? "var(--status-stress)" : "var(--status-idle)";
  return (
    <div className="rounded-lg border px-3.5 py-2.5 text-[12.5px] text-ink2" style={{ borderColor: `color-mix(in srgb, ${color} 55%, var(--border))` }}>
      {text}
    </div>
  );
}

function CommandStatus({ c, t }: { c: ScopeCommand | null; t: Strings }) {
  if (!c) return null;
  if (isOpen(c)) return <span className="text-xs text-ink2">{t.scWaiting}…</span>;
  if (c.status === "done") return <span className="text-xs text-ink2">{t.scApplied}</span>;
  return (
    <span className="text-xs text-status-critical">
      {c.status === "expired" ? t.scExpired : `${t.scNotApplied}${errorText(c) ? `: ${errorText(c)}` : ""}`}
    </span>
  );
}

function SettingField({
  s, t, value, dirty, error, disabled, onChange,
}: {
  s: ScopeSettingSpec; t: Strings; value: Edit; dirty: boolean; error?: "number" | "value"; disabled: boolean;
  onChange: (v: Edit) => void;
}) {
  const id = `sc-${s.id}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[10.5px] uppercase tracking-[0.04em] text-ink2">
        {s.label}{s.type === "num" && s.unit ? ` (${s.unit})` : ""}{dirty ? " *" : ""}
      </label>
      {s.type === "num" ? (
        <input id={id} className={field} inputMode="decimal" value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : s.type === "bool" ? (
        <select id={id} className={field} value={value === true ? "1" : "0"} disabled={disabled} onChange={(e) => onChange(e.target.value === "1")}>
          <option value="1">{t.scOn}</option>
          <option value="0">{t.scOff}</option>
        </select>
      ) : (
        <select id={id} className={field} value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {s.options.map((o) => <option key={o.reply} value={o.reply}>{o.send}</option>)}
        </select>
      )}
      {error && <span className="text-[11px] text-status-critical">{error === "number" ? t.scBadNumber : t.scBadValue}</span>}
    </div>
  );
}

function Snapshots({
  state, commands, t, usable, snapName, setSnapName, confirm, setConfirm, send,
}: {
  state: ScopeState; commands: ScopeCommand[]; t: Strings; usable: boolean;
  snapName: string; setSnapName: (v: string) => void; confirm: string | null; setConfirm: (v: string | null) => void;
  send: (kind: "snapshot_save" | "snapshot_apply" | "snapshot_delete" | "guard", payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const guard = state.guard;
  const clean = cleanSnapshotName(snapName);
  const exists = state.snapshots.some((s) => s.name === clean);
  const lastSnap = commands.find((c) => c.kind !== "settings_apply") ?? null;
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-[13px] font-semibold">{t.scSnapshots}</h3>
      {state.snapshots.length === 0 ? (
        <div className="text-xs text-ink2">{t.scSnapNone}</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {state.snapshots.map((s) => (
            <li key={s.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3.5 py-2">
              <div>
                <div className="font-mono text-[12.5px] font-semibold">
                  {s.name}{guard?.snapshot === s.name ? ` · ${t.scGuard}` : ""}
                </div>
                {s.time && <div className="font-mono text-[10.5px] text-ink2">{s.time.replace("T", " ")}</div>}
              </div>
              {confirm === s.name ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11.5px] text-ink2">{t.scSnapLoadConfirm}</span>
                  <button className={primary} disabled={!usable} onClick={async () => { await send("snapshot_apply", { name: s.name }); setConfirm(null); }}>{t.scSnapLoadYes}</button>
                  <button className={btn} onClick={() => setConfirm(null)}>{t.cancel}</button>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <button className={btn} disabled={!usable} onClick={() => setConfirm(s.name)}>{t.scSnapLoad}</button>
                  <button className={btn} disabled={!usable || guard?.snapshot === s.name} onClick={() => void send("snapshot_delete", { name: s.name })}>{t.scSnapDelete}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-[180px] flex-1 flex-col gap-1">
          <label htmlFor="sc-snap-name" className="text-[10.5px] uppercase tracking-[0.04em] text-ink2">{t.scSnapName}</label>
          <input id="sc-snap-name" className={field} value={snapName} maxLength={40} disabled={!usable} onChange={(e) => setSnapName(e.target.value)} />
        </div>
        <button className={btn} disabled={!usable || !clean || exists}
          onClick={async () => { if (await send("snapshot_save", { name: clean })) setSnapName(""); }}>{t.scSnapSave}</button>
      </div>
      {exists && <div className="text-[11.5px] text-ink2">{t.scSnapExists}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5">
        <div>
          <div className="text-[13px] font-semibold">{t.scGuard}: {guard?.enabled ? t.scGuardOn : t.scGuardOff}</div>
          <p className="mt-0.5 text-[11.5px] text-ink2">{t.scGuardHint}</p>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label={t.scGuardSnapshot} className={`${field} w-auto`} disabled={!usable} value={guard?.snapshot ?? ""}
            onChange={(e) => void send("guard", { enabled: guard?.enabled ?? true, snapshot: e.target.value || null })}>
            <option value="">-</option>
            {state.snapshots.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          <button className={btn} disabled={!usable || !guard?.snapshot}
            onClick={() => void send("guard", { enabled: !guard?.enabled, snapshot: guard?.snapshot ?? null })}>
            {guard?.enabled ? t.scGuardOff : t.scGuardOn}
          </button>
        </div>
      </div>
      <CommandStatus c={lastSnap} t={t} />
    </div>
  );
}
