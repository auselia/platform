"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cavitation } from "@/lib/types";
import type { Strings } from "@/lib/dashboard/i18n";
import { CLASS_KEY } from "@/lib/dashboard/cavitation";
import {
  countMatching, deleteIds, deleteMatching, listMatching,
  type CaptureFilter, type CaptureRow, type DeleteOutcome,
} from "@/lib/dashboard/cavitation-delete";
import { FlagMark } from "./ui";

const LIST_LIMIT = 100;
export const fill = (s: string, v: Record<string, string | number>) =>
  Object.entries(v).reduce((acc, [k, x]) => acc.replaceAll(`{${k}}`, String(x)), s);
// Pick the singular string for exactly one, the plural otherwise.
const plural = (n: number, many: string, one: string, shown: string | number = n) => fill(n === 1 ? one : many, { n: shown });

export const danger = "rounded-lg bg-status-critical px-3.5 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45";
export const quiet = "rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-ink disabled:opacity-45";
const field = "rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-ink";
const warnBox = "rounded-lg border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-[12.5px] text-ink";

// Esc and a click outside close it (never while a delete is running). Cancel takes focus when
// the dialog opens, so pressing Enter or Space can never confirm a destructive action by accident.
export function Modal({ children, onClose, locked }: { children: React.ReactNode; onClose: () => void; locked: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !locked) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5" onClick={() => { if (!locked) onClose(); }}>
      <div
        role="dialog" aria-modal="true"
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function TypeToConfirm({ t, value, onChange, disabled }: { t: Strings; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink2">
      {fill(t.delTypeToConfirm, { word: t.delWord })}
      <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} autoComplete="off" className={field} />
    </label>
  );
}

const typedOk = (t: Strings, v: string) => v.trim().toLowerCase() === t.delWord.toLowerCase();

// One capture or a hand-picked few: a clear warning, and for two or more the same typed
// confirmation as the bulk dialog (a single capture only needs the warning). Reached from the
// red button under a capture's details, or from the bar that appears when cards are selected.
export function DeleteCapturesDialog({
  captures, plantId, supabase, t, locale, onClose, onDeleted,
}: {
  captures: Cavitation[]; plantId: string; supabase: SupabaseClient; t: Strings; locale: string | undefined;
  onClose: () => void; onDeleted: (o: DeleteOutcome) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState("");
  const n = captures.length;
  const one = captures[0];
  const flagged = captures.filter((c) => c.flagged).length;
  const needsTyping = n > 1;
  const ready = !needsTyping || typedOk(t, confirm);

  async function run() {
    setBusy(true);
    setError("");
    const o = await deleteIds(supabase, plantId, captures.map((c) => c.id));
    if (o.failed && !o.count) { setBusy(false); setError(t.delFailed); return; }
    onDeleted(o);
    onClose();
  }

  return (
    <Modal onClose={onClose} locked={busy}>
      <h3 className="m-0 font-[family-name:var(--font-display)] text-[17px] font-semibold">
        {n === 1 ? t.delOneTitle : fill(t.delSelTitle, { n })}
      </h3>
      <p className={`mt-2 ${warnBox}`}>{n === 1 ? t.delOneWarn : fill(t.delSelWarn, { n })}</p>
      {n === 1 && one && (
        <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs">
          <span>{new Date(one.ts).toLocaleString(locale, { dateStyle: "medium", timeStyle: "medium" })}</span>
          <span className="text-ink2">{t[CLASS_KEY[one.cls]]}</span>
        </div>
      )}
      {flagged > 0 && (
        <p className="mt-2 text-[12px] font-semibold text-status-critical">
          {n === 1 ? t.delFlaggedNote : plural(flagged, t.delFlaggedCount, t.delFlaggedCountOne)}
        </p>
      )}
      {needsTyping && <div className="mt-3"><TypeToConfirm t={t} value={confirm} onChange={setConfirm} disabled={busy} /></div>}
      {error && <p className="mt-2 text-[12px] text-status-critical">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} disabled={busy} autoFocus className={quiet}>{t.cancel}</button>
        <button onClick={run} disabled={busy || !ready} className={danger}>
          {busy ? t.delWorking : n === 1 ? t.delOneBtn : plural(n, t.delConfirmBtn, t.delConfirmBtnOne)}
        </button>
      </div>
    </Modal>
  );
}

// Many at once: filter by time, tick individual captures or take everything that matches
// (the flood case, done in one database call), then confirm by typing a word. Flagged captures
// are left out unless asked for, because a flag is the researcher's own record.
export function ManageCapturesDialog({
  supabase, plantId, t, locale, onClose, onDeleted,
}: {
  supabase: SupabaseClient; plantId: string; t: Strings; locale: string | undefined;
  onClose: () => void; onDeleted: (o: DeleteOutcome) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeFlagged, setIncludeFlagged] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [rows, setRows] = useState<CaptureRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filter: CaptureFilter = useMemo(() => ({
    plantId,
    from: from ? new Date(from).toISOString() : null,
    to: to ? new Date(to).toISOString() : null,
    includeFlagged,
  }), [plantId, from, to, includeFlagged]);

  useEffect(() => {
    let alive = true;
    const id = setTimeout(async () => {
      setTotal(null);
      const [n, list] = await Promise.all([countMatching(supabase, filter), listMatching(supabase, filter, LIST_LIMIT)]);
      if (!alive) return;
      setTotal(n);
      setRows(list);
      setSelected(new Set());
      setAllMatching(false);
    }, 250);
    return () => { alive = false; clearTimeout(id); };
  }, [supabase, filter]);

  const count = allMatching ? (total ?? 0) : selected.size;
  const allShownSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(id: number) {
    setAllMatching(false);
    setSelected((s) => {
      const next = new Set(allMatching ? rows.map((r) => r.id) : s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleShown() {
    setAllMatching(false);
    setSelected(allShownSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  async function run() {
    setBusy(true);
    setError("");
    const o = allMatching ? await deleteMatching(supabase, filter) : await deleteIds(supabase, plantId, [...selected]);
    if (o.failed && !o.count) { setBusy(false); setError(t.delFailed); return; }
    onDeleted(o);
    onClose();
  }

  return (
    <Modal onClose={onClose} locked={busy}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="m-0 font-[family-name:var(--font-display)] text-[17px] font-semibold">{t.delTitle}</h3>
        <button onClick={onClose} disabled={busy} aria-label={t.cancel} className="text-ink2 hover:text-ink">&times;</button>
      </div>
      <p className={`mb-3 ${warnBox}`}>{t.delWarn}</p>

      <div className="mb-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-[0.04em] text-ink2">
          {t.delFrom}
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-[0.04em] text-ink2">
          {t.delTo}
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} className={field} />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-ink">
          <input type="checkbox" checked={includeFlagged} onChange={(e) => setIncludeFlagged(e.target.checked)} disabled={busy} />
          {t.delIncludeFlagged}
        </label>
      </div>

      <div className="mb-1.5 text-xs text-ink2">
        {total === null ? t.delCounting : total === 0 ? t.delNoneMatch : plural(total, t.delMatching, t.delMatchingOne, total.toLocaleString(locale))}
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-1.5 text-xs">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={allMatching || allShownSelected} onChange={toggleShown} disabled={busy} />
              {fill(t.delSelectShown, { n: rows.length })}
            </label>
            {allMatching ? (
              <span className="text-ink2">
                {fill(t.delAllSelected, { n: (total ?? 0).toLocaleString(locale) })}{" "}
                <button onClick={() => { setAllMatching(false); setSelected(new Set()); }} className="font-semibold text-accent">{t.delClear}</button>
              </span>
            ) : allShownSelected && (total ?? 0) > rows.length ? (
              <button onClick={() => setAllMatching(true)} disabled={busy} className="font-semibold text-accent">
                {fill(t.delSelectAll, { n: (total ?? 0).toLocaleString(locale) })}
              </button>
            ) : null}
          </div>
          <ul className="m-0 max-h-56 list-none overflow-y-auto p-0">
            {rows.map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-2 border-b border-border/60 py-1.5 text-xs">
                  <input type="checkbox" checked={allMatching || selected.has(r.id)} onChange={() => toggle(r.id)} disabled={busy} />
                  <span className="font-mono">{new Date(r.ts).toLocaleString(locale, { dateStyle: "short", timeStyle: "medium" })}</span>
                  <span className="text-ink2">{t[CLASS_KEY[r.cls]]}</span>
                  {r.peak_mv !== null && <span className="font-mono text-ink2">{r.peak_mv} mV</span>}
                  {r.flagged && <FlagMark title={t.cavFlagged} />}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <p className="mt-3 text-xs text-status-critical">{error}</p>}

      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
        <TypeToConfirm t={t} value={confirm} onChange={setConfirm} disabled={busy || count === 0} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} autoFocus className={quiet}>{t.cancel}</button>
          <button onClick={run} disabled={busy || count === 0 || !typedOk(t, confirm)} className={danger}>
            {busy ? t.delWorking : plural(count, t.delConfirmBtn, t.delConfirmBtnOne, count.toLocaleString(locale))}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Permanent deletion from Recently deleted, skipping the 24 hour hold. Always typed: this one
// cannot be undone.
export function DeleteForeverDialog({
  count, t, onClose, onConfirm,
}: {
  count: number; t: Strings; onClose: () => void; onConfirm: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    if (await onConfirm()) { onClose(); return; }
    setBusy(false);
    setError(t.delFailed);
  }

  return (
    <Modal onClose={onClose} locked={busy}>
      <h3 className="m-0 font-[family-name:var(--font-display)] text-[17px] font-semibold">{t.rdForeverTitle}</h3>
      <p className={`mt-2 ${warnBox}`}>{count === 1 ? t.rdForeverOne : fill(t.rdForeverWarn, { n: count })}</p>
      <div className="mt-3"><TypeToConfirm t={t} value={confirm} onChange={setConfirm} disabled={busy} /></div>
      {error && <p className="mt-2 text-[12px] text-status-critical">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} disabled={busy} autoFocus className={quiet}>{t.cancel}</button>
        <button onClick={run} disabled={busy || !typedOk(t, confirm)} className={danger}>{busy ? t.delWorking : t.rdForeverBtn}</button>
      </div>
    </Modal>
  );
}
