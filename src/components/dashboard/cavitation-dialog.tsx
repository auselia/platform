"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cavitation } from "@/lib/types";
import { fill, type Lang, type Strings } from "@/lib/dashboard/i18n";
import { CLASS_KEY } from "@/lib/dashboard/cavitation";
import { loadSignal } from "@/lib/dashboard/cavitation-full";
import {
  csvSignal, csvSpectrum, spectrum, stats, type Signal, type Spectrum, type Win,
} from "@/lib/dashboard/dsp";
import SignalCanvas, { clampView, fullRange, type Mode, type Range } from "./signal-canvas";
import SpectrumCanvas from "./spectrum-canvas";
import { download } from "./use-canvas";

type Tab = "wave" | "spec";
type Load = { path: string; sig: Signal | null; error: boolean };

const btn = "rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent";
const field = "rounded-md border-[1.5px] border-border bg-surface px-1.5 py-1 text-xs text-ink";

export default function CavitationDialog({
  supabase, list, index, t, lang, canFlag, onNavigate, onClose, onFlag,
}: {
  supabase: SupabaseClient;
  list: Cavitation[]; index: number;
  t: Strings; lang: Lang; canFlag: boolean;
  onNavigate: (id: number) => void;
  onClose: () => void;
  onFlag: (c: Cavitation, flagged: boolean, note: string) => Promise<boolean>;
}) {
  const c = list[index];
  const locale = lang === "es" ? "es-CL" : undefined;
  const panelRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLCanvasElement | null>(null);
  const specRef = useRef<HTMLCanvasElement | null>(null);
  // Stable callbacks so the canvases do not re-attach on every render.
  const setWaveEl = useCallback((el: HTMLCanvasElement | null) => { waveRef.current = el; }, []);
  const setSpecEl = useCallback((el: HTMLCanvasElement | null) => { specRef.current = el; }, []);

  const [tab, setTab] = useState<Tab>("wave");
  const [load, setLoad] = useState<Load | null>(null);
  const [view, setView] = useState<Range>([0, 1]);
  const [sel, setSel] = useState<Range | null>(null);
  const [mode, setMode] = useState<Mode>("pan");

  const [fmin, setFmin] = useState(100), [fmax, setFmax] = useState(1000);
  const [win, setWin] = useState<Win>("hann"), [pad, setPad] = useState(8);
  const [db, setDb] = useState(false), [ref, setRef] = useState(true);
  const [spec, setSpec] = useState<{ sp: Spectrum | null; error: string | null; src: Range } | null>(null);

  const [note, setNote] = useState(c.flag_note);
  const [busy, setBusy] = useState(false);
  const [flagError, setFlagError] = useState(false);

  // A different capture is open: start its note from what is saved.
  useEffect(() => { setNote(c.flag_note); setFlagError(false); }, [c.id, c.flag_note]);

  // Lock page scroll and restore focus when the dialog closes.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => { document.body.style.overflow = overflow; prev?.focus?.(); };
  }, []);

  // Load the full waveform of the current capture.
  const path = c.full_path;
  useEffect(() => {
    let alive = true;
    if (!path || !c.scale) return;
    loadSignal(supabase, { full_path: path, scale: c.scale })
      .then((sig) => { if (alive) { setLoad({ path, sig, error: false }); setView(fullRange(sig)); setSel(null); } })
      .catch(() => { if (alive) setLoad({ path, sig: null, error: true }); });
    return () => { alive = false; };
  }, [supabase, path, c.scale]);

  const sig = load && load.path === path ? load.sig : null;
  const failed = !!(load && load.path === path && load.error);

  // Spectrum of the selection, or of the current view when nothing is selected. Debounced.
  const src: Range | null = sel ?? (sig ? view : null);
  const srcA = src?.[0], srcB = src?.[1];
  useEffect(() => {
    if (tab !== "spec" || !sig || srcA === undefined || srcB === undefined) return;
    const id = setTimeout(() => {
      const r = spectrum(sig, srcA, srcB, { fminKhz: fmin, fmaxKhz: fmax, win, pad, ref });
      setSpec("error" in r ? { sp: null, error: r.error, src: [srcA, srcB] } : { sp: r, error: null, src: [srcA, srcB] });
    }, 250);
    return () => clearTimeout(id);
  }, [tab, sig, srcA, srcB, fmin, fmax, win, pad, ref]);

  const selStats = useMemo(() => (sig && sel ? stats(sig, sel[0], sel[1]) : null), [sig, sel]);

  const go = (d: number) => { const n = list[index + d]; if (n) onNavigate(n.id); };
  const flagAction = async (flagged: boolean) => {
    setBusy(true);
    const ok = await onFlag(c, flagged, flagged ? note : "");
    setFlagError(!ok);
    if (ok && !flagged) setNote("");
    setBusy(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && (el as HTMLInputElement).type !== "checkbox";
      if (e.key === "Escape") { onClose(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if ((e.key === "f" || e.key === "F") && canFlag) { e.preventDefault(); void flagAction(!c.flagged); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const key = c.capture_key;
  const name = (extra: string) => `${key}_${extra}`;
  const setViewClamped = (v: Range) => sig && setView(clampView(sig, v[0], v[1]));
  const csvRange = (a: number, b: number, label: string) =>
    sig && download(name(`${label}.csv`), new Blob([csvSignal(sig, a, b)], { type: "text/csv" }));
  const png = (cv: HTMLCanvasElement | null, label: string) =>
    cv?.toBlob((b) => b && download(name(`${label}.png`), b));

  const setRange = (a: number, b: number) => { setFmin(a); setFmax(b); };
  const numIn = (v: string, dflt: number) => (v === "" || Number.isNaN(Number(v)) ? dflt : Number(v));

  const when = new Date(c.ts).toLocaleString(locale, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  const specSp = spec?.sp ?? null;
  const warn = (() => {
    if (!spec) return "";
    if (spec.error) return spec.error === "outOfRange" ? t.spOutOfRange : t.spShort;
    if (!specSp) return "";
    const bins = (fmax - fmin) / specSp.res_khz;
    if (bins < 8) return fill(t.spFewBins, { bins: bins.toFixed(1), lo: fmin, hi: fmax, res: specSp.res_khz.toFixed(2), need: ((8 * specSp.t_us * specSp.res_khz) / (fmax - fmin)).toFixed(0) });
    if ((specSp.t_us * Math.max(fmin, 1e-3)) / 1e3 < 1.5) return fill(t.spLowEnd, { lo: fmin });
    return "";
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 p-2 sm:p-5"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t.dlgTitle}
        className="flex max-h-full w-full max-w-[1240px] flex-col overflow-y-auto rounded-2xl border border-border bg-bg px-4 py-3.5 text-ink outline-none sm:px-6 sm:py-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-[family-name:var(--font-display)] text-lg font-semibold">{t.dlgTitle}</div>
            <div className="font-mono text-xs text-ink2">
              {when} · #{key.slice(-5)} · {t[CLASS_KEY[c.cls]]}
              {c.flagged && <span className="ml-2 rounded-full bg-amber px-2 py-0.5 font-semibold text-forest">{t.cavFlagged}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button className={btn} disabled={index <= 0} onClick={() => go(-1)} aria-label={t.dlgPrev} title={t.dlgPrev}>&larr;</button>
            <button className={btn} disabled={index >= list.length - 1} onClick={() => go(1)} aria-label={t.dlgNext} title={t.dlgNext}>&rarr;</button>
            <button className={btn} onClick={onClose} aria-label={t.dlgClose}>{t.dlgClose}</button>
          </div>
        </div>

        <div className="mt-2 font-mono text-[11.5px] text-ink2">
          {[
            c.peak_mv !== null && `${t.cavPeak} ${c.peak_mv} mV`,
            c.snr !== null && `${t.cavSnr} ${c.snr.toFixed(1)}`,
            c.dur_us !== null && `${t.cavDuration} ${c.dur_us} µs`,
            c.swings !== null && `${t.cavSwings} ${c.swings}`,
            c.freq_khz !== null && `${t.cavFreq} ${c.freq_khz} kHz`,
            c.level_mv !== null && `${t.cavLevel} ${c.level_mv} mV`,
            sig && `${sig.mv.length.toLocaleString()} ${t.dlgSamples}, ${(sig.dt_us * 1000).toFixed(1)} ns ${t.dlgApart}`,
          ].filter(Boolean).join(" · ")}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-b border-border pb-2.5">
          {([["wave", t.dlgWave], ["spec", t.dlgSpec]] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id} onClick={() => setTab(id)} aria-pressed={tab === id}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === id ? "bg-accent text-accent-ink" : "border border-border text-ink2"}`}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          {tab === "wave" ? (
            <>
              <button className={btn} title={t.dlgModeHint} onClick={() => setMode(mode === "pan" ? "select" : "pan")}>
                {mode === "pan" ? t.dlgModePan : t.dlgModeSelect}
              </button>
              <button className={btn} disabled={!sig} onClick={() => sig && setView(fullRange(sig))}>{t.dlgReset}</button>
              <button className={btn} disabled={!sel} onClick={() => sel && setViewClamped(sel)}>{t.dlgZoomSel}</button>
              <button className={btn} disabled={!sel} onClick={() => setSel(null)}>{t.dlgClear}</button>
              <span className="mx-1 h-5 w-px bg-border" />
              <button className={btn} disabled={!sel || !sig} onClick={() => sel && csvRange(sel[0], sel[1], `${sel[0].toFixed(2)}_${sel[1].toFixed(2)}us`)}>{t.dlgCsvSel}</button>
              <button className={btn} disabled={!sig} onClick={() => csvRange(view[0], view[1], `${view[0].toFixed(2)}_${view[1].toFixed(2)}us`)}>{t.dlgCsvView}</button>
              <button className={btn} disabled={!sig} onClick={() => sig && csvRange(fullRange(sig)[0], fullRange(sig)[1], "all")}>{t.dlgCsvAll}</button>
              <button className={btn} disabled={!sig} onClick={() => png(waveRef.current, `${view[0].toFixed(2)}_${view[1].toFixed(2)}us`)}>{t.dlgPng}</button>
            </>
          ) : (
            <>
              <label className="flex items-center gap-1 text-xs text-ink2">{t.spFrom}
                <input type="number" min={0} step={10} value={fmin} onChange={(e) => setFmin(numIn(e.target.value, 0))} className={`${field} w-20`} />
              </label>
              <label className="flex items-center gap-1 text-xs text-ink2">{t.spTo}
                <input type="number" min={1} step={10} value={fmax} onChange={(e) => setFmax(numIn(e.target.value, 1000))} className={`${field} w-24`} /> {t.spUnitKhz}
              </label>
              <button className={btn} onClick={() => setRange(100, 1000)}>{t.spRange1}</button>
              <button className={btn} onClick={() => setRange(20, 500)}>{t.spRange2}</button>
              <button className={btn} onClick={() => setRange(500, 5000)}>{t.spRange3}</button>
              <button className={btn} onClick={() => setRange(0, 20000)}>{t.spRangeWide}</button>
              <span className="mx-1 h-5 w-px bg-border" />
              <label className="flex items-center gap-1 text-xs text-ink2">{t.spWindow}
                <select value={win} onChange={(e) => setWin(e.target.value as Win)} className={field}>
                  <option value="hann">{t.spHann}</option><option value="rect">{t.spRect}</option><option value="blackman">{t.spBlackman}</option>
                </select>
              </label>
              <label className="flex items-center gap-1 text-xs text-ink2">{t.spPad}
                <select value={pad} onChange={(e) => setPad(Number(e.target.value))} className={field}>
                  {[1, 4, 8, 16].map((n) => <option key={n} value={n}>{n}</option>)}
                </select> ×
              </label>
              <label className="flex items-center gap-1 text-xs text-ink2">{t.spScale}
                <select value={db ? "db" : "lin"} onChange={(e) => setDb(e.target.value === "db")} className={field}>
                  <option value="lin">{t.spLinear}</option><option value="db">{t.spDb}</option>
                </select>
              </label>
              <label className="flex items-center gap-1 text-xs text-ink2">
                <input type="checkbox" checked={ref} onChange={(e) => setRef(e.target.checked)} /> {t.spNoise}
              </label>
              <span className="mx-1 h-5 w-px bg-border" />
              <button className={btn} disabled={!specSp} onClick={() => specSp && spec && download(name(`fft_${spec.src[0].toFixed(2)}_${spec.src[1].toFixed(2)}us_${fmin}-${fmax}kHz.csv`), new Blob([csvSpectrum(specSp)], { type: "text/csv" }))}>{t.spCsv}</button>
              <button className={btn} disabled={!specSp} onClick={() => png(specRef.current, "fft")}>{t.spPng}</button>
            </>
          )}
        </div>

        <div className="mt-3">
          {!path ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-ink2">{t.dlgNoFull}</div>
          ) : failed ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-ink2">{t.dlgFailFull}</div>
          ) : !sig ? (
            <div className="rounded-lg border border-border px-4 py-10 text-center text-sm text-ink2">{t.dlgLoadingFull}…</div>
          ) : tab === "wave" ? (
            <>
              <SignalCanvas
                sig={sig} c={c} t={t} view={view} onView={setViewClamped} sel={sel} onSel={setSel} mode={mode} onCanvas={setWaveEl}
              />
              {sel && selStats && (
                <div className="mt-1 font-mono text-[11.5px] text-ink">
                  {t.dlgSelection} {sel[0].toFixed(3)} to {sel[1].toFixed(3)} µs · Δt {selStats.dur_us.toFixed(2)} µs · {selStats.n.toLocaleString()} {t.dlgSamples} ·{" "}
                  {t.dlgMin} {selStats.min_mv.toFixed(2)} · {t.dlgMax} {selStats.max_mv.toFixed(2)} · Vpp {selStats.vpp_mv.toFixed(2)} mV ·{" "}
                  {t.dlgRmsAc} {selStats.rms_mv.toFixed(2)} mV · {t.dlgMean} {selStats.mean_mv.toFixed(2)} mV
                  {selStats.freq_khz !== null && ` · ${t.dlgDominant} ${selStats.freq_khz} kHz`}
                </div>
              )}
              <div className="mt-2 text-[11.5px] text-ink2">{t.dlgHint}</div>
            </>
          ) : (
            <>
              <div className="mb-1.5 font-mono text-[11.5px] text-ink2">
                {sel ? t.spSrcSelection : t.spSrcView}: {(spec?.src ?? src ?? [0, 0])[0].toFixed(2)} to {(spec?.src ?? src ?? [0, 0])[1].toFixed(2)} µs
              </div>
              {specSp ? (
                <>
                  <SpectrumCanvas sp={specSp} db={db} t={t} onCanvas={setSpecEl} />
                  <div className="mt-2 text-[11.5px] text-ink2">
                    {fill(t.spInfo, { n: specSp.n, t: specSp.t_us.toFixed(1), res: specSp.res_khz.toFixed(2), df: specSp.df_khz.toFixed(3), nyq: Math.round(specSp.nyq_khz) })}
                    {specSp.ref
                      ? ` ${fill(t.spRef, { a: specSp.ref_t![0].toFixed(1), b: specSp.ref_t![1].toFixed(1) })}${specSp.ref_short ? ` ${t.spRefShort}` : ""}`
                      : ref ? ` ${t.spRefNone}` : ""}
                  </div>
                  {warn && <div className="mt-1 text-[11.5px] font-semibold text-status-stress">{warn}</div>}
                  {specSp.peaks.length > 0 && (
                    <table className="mt-2 border-collapse text-xs">
                      <thead>
                        <tr className="text-left text-[10.5px] uppercase tracking-[0.04em] text-ink2">
                          <th className="pr-5 font-medium">{t.spPeak}</th><th className="pr-5 font-medium">{t.spFreq}</th>
                          <th className="pr-5 font-medium">{t.spAmp}</th>{specSp.ref && <th className="font-medium">{t.spVsNoise}</th>}
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {specSp.peaks.map((p, i) => {
                          let vs = "";
                          if (specSp.ref) {
                            let b = 0;
                            for (let k = 1; k < specSp.f.length; k++) if (Math.abs(specSp.f[k] - p.f_khz) < Math.abs(specSp.f[b] - p.f_khz)) b = k;
                            vs = `${(p.a_mv / Math.max(specSp.ref[b], 1e-9)).toFixed(1)}×`;
                          }
                          return (
                            <tr key={p.f_khz}>
                              <td className="pr-5">#{i + 1}</td><td className="pr-5">{p.f_khz.toFixed(2)} kHz</td>
                              <td className="pr-5">{p.a_mv.toFixed(4)} mV</td>{specSp.ref && <td>{vs}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              ) : spec?.error ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-ink2">{warn}</div>
              ) : (
                <div className="rounded-lg border border-border px-4 py-10 text-center text-sm text-ink2">{t.spComputing}…</div>
              )}
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
          {canFlag ? (
            <>
              <label htmlFor="dlg-note" className="text-[10.5px] uppercase tracking-[0.04em] text-ink2">{t.cavNote}</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="dlg-note" type="text" value={note} maxLength={300} placeholder={t.cavNotePh} onChange={(e) => setNote(e.target.value)}
                  className="min-w-[200px] flex-1 rounded-lg border-[1.5px] border-border bg-surface px-2.5 py-2 text-xs text-ink"
                />
                {c.flagged ? (
                  <>
                    <button disabled={busy || note === c.flag_note} onClick={() => flagAction(true)} className="rounded-lg bg-amber px-3.5 py-2 text-xs font-semibold text-forest disabled:opacity-50">{t.cavSaveNote}</button>
                    <button disabled={busy} onClick={() => flagAction(false)} className={btn}>{t.cavUnflag}</button>
                  </>
                ) : (
                  <button disabled={busy} onClick={() => flagAction(true)} className="rounded-lg bg-amber px-3.5 py-2 text-xs font-semibold text-forest disabled:opacity-50">{t.cavFlag}</button>
                )}
                {flagError && <span className="text-xs text-status-critical">{t.saveFailed}</span>}
              </div>
            </>
          ) : (
            <div className="text-[11.5px] text-ink2">{c.flagged && c.flag_note ? c.flag_note : t.cavSignIn}</div>
          )}
        </div>
      </div>
    </div>
  );
}
