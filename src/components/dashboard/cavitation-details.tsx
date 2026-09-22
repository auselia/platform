"use client";

import { useMemo, useState } from "react";
import type { Cavitation } from "@/lib/types";
import type { Strings } from "@/lib/dashboard/i18n";
import { CLASS_KEY, nearestIndex, niceLimit, traceMv, traceTime } from "@/lib/dashboard/cavitation";

// Right column of focus mode for the Cavitations tab: the selected capture's waveform,
// metrics, and flag/note form. A port of the classic Cavitations tab's Viewer/Trace,
// narrowed for the right column (2-column metric grid instead of 3).
export default function CavitationDetails({
  c, y, t, locale, canFlag, onFlag, onOpen, advanced,
}: {
  c: Cavitation | null; y: number[] | undefined; t: Strings; locale: string | undefined;
  canFlag: boolean;
  onFlag: (c: Cavitation, flagged: boolean, note: string) => Promise<boolean>;
  onOpen: () => void;
  // Off by default: hides the raw metrics grid and the full-analysis dialog
  // shortcut, keeping the waveform trace and flag/note controls. See
  // settings-oscilloscope.tsx.
  advanced: boolean;
}) {
  if (!c) return <div className="text-xs text-ink2">{t.cavSelect}</div>;
  return <Viewer c={c} y={y} t={t} locale={locale} canFlag={canFlag} onFlag={onFlag} onOpen={onOpen} advanced={advanced} />;
}

function Viewer({
  c, y, t, locale, canFlag, onFlag, onOpen, advanced,
}: {
  c: Cavitation; y: number[] | undefined; t: Strings; locale: string | undefined; canFlag: boolean;
  onFlag: (c: Cavitation, flagged: boolean, note: string) => Promise<boolean>;
  onOpen: () => void;
  advanced: boolean;
}) {
  const [note, setNote] = useState(c.flag_note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const flagAction = async (flagged: boolean) => {
    setBusy(true);
    const ok = await onFlag(c, flagged, flagged ? note : "");
    setError(!ok);
    if (ok && !flagged) setNote("");
    setBusy(false);
  };

  const metrics: [string, string][] = [
    [t.cavPeak, c.peak_mv !== null ? `${c.peak_mv} mV` : "-"],
    [t.cavSnr, c.snr !== null ? c.snr.toFixed(1) : "-"],
    [t.cavDuration, c.dur_us !== null ? `${c.dur_us} µs` : "-"],
    [t.cavSwings, c.swings !== null ? String(c.swings) : "-"],
    [t.cavFreq, c.freq_khz !== null ? `${c.freq_khz} kHz` : "-"],
    [t.cavLevel, c.level_mv !== null ? `${c.level_mv} mV` : "-"],
  ];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-xs font-semibold">
          {new Date(c.ts).toLocaleString(locale, {
            year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
          })}
        </div>
        <span className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.03em] text-ink2">
          {t[CLASS_KEY[c.cls]]}
        </span>
      </div>

      <Trace c={c} y={y} t={t} />

      {advanced && (
        <>
          <button
            onClick={onOpen}
            className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-2"
          >
            {t.cavOpen}
          </button>

          <div className="grid grid-cols-2 gap-1.5">
            {metrics.map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border px-2.5 py-1.5">
                <div className="text-[9.5px] uppercase tracking-[0.04em] text-ink2">{k}</div>
                <div className="mt-0.5 font-mono text-[13px] font-semibold">{v}</div>
              </div>
            ))}
          </div>
          {c.clipped && <div className="text-[11.5px] text-ink2">{t.cavClipped}</div>}
        </>
      )}

      {canFlag ? (
        <div className="flex flex-col gap-2">
          <label className="text-[10.5px] uppercase tracking-[0.04em] text-ink2" htmlFor={`note-${c.id}`}>{t.cavNote}</label>
          <textarea
            id={`note-${c.id}`} value={note} maxLength={300} rows={2} placeholder={t.cavNotePh}
            onChange={(e) => setNote(e.target.value)}
            className="resize-y rounded-lg border-[1.5px] border-border bg-surface px-2.5 py-2 text-xs text-ink"
          />
          <div className="flex flex-wrap items-center gap-2">
            {c.flagged ? (
              <>
                <button
                  disabled={busy || note === c.flag_note} onClick={() => flagAction(true)}
                  className="rounded-lg bg-amber px-3.5 py-2 text-xs font-semibold text-forest disabled:opacity-50"
                >
                  {t.cavSaveNote}
                </button>
                <button
                  disabled={busy} onClick={() => flagAction(false)}
                  className="rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-ink disabled:opacity-50"
                >
                  {t.cavUnflag}
                </button>
              </>
            ) : (
              <button
                disabled={busy} onClick={() => flagAction(true)}
                className="rounded-lg bg-amber px-3.5 py-2 text-xs font-semibold text-forest disabled:opacity-50"
              >
                {t.cavFlag}
              </button>
            )}
            {error && <span className="text-xs text-status-critical">{t.saveFailed}</span>}
          </div>
        </div>
      ) : (
        <div className="text-[11.5px] text-ink2">{c.flagged && c.flag_note ? c.flag_note : t.cavSignIn}</div>
      )}
    </div>
  );
}

const VW = 560, VH = 190, PL = 44, PR = 10, PT = 10, PB = 26;

function Trace({ c, y, t }: { c: Cavitation; y: number[] | undefined; t: Strings }) {
  const [hover, setHover] = useState<number | null>(null);
  const mv = useMemo(() => (y ? traceMv(y) : null), [y]);

  if (!mv) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border text-xs text-ink2" style={{ aspectRatio: `${VW} / ${VH}` }}>
        {t.cavLoadingTrace}…
      </div>
    );
  }

  const n = mv.length;
  const lvl = Math.abs(c.level_mv ?? 0);
  let peak = lvl;
  for (const v of mv) if (Math.abs(v) > peak) peak = Math.abs(v);
  const lim = niceLimit(peak * 1.08);
  const iw = VW - PL - PR, ih = VH - PT - PB;
  const X = (tt: number) => PL + ((tt - c.t0_us) / (c.t1_us - c.t0_us)) * iw;
  const Y = (v: number) => PT + ih / 2 - (v / lim) * (ih / 2);
  const d = mv.map((v, i) => `${i ? "L" : "M"}${(PL + (i / (n - 1)) * iw).toFixed(1)} ${Y(v).toFixed(1)}`).join("");

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => c.t0_us + f * (c.t1_us - c.t0_us));
  const hi = hover === null ? null : Math.min(n - 1, Math.max(0, hover));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const tt = c.t0_us + (((e.clientX - r.left) / r.width) * VW - PL) / iw * (c.t1_us - c.t0_us);
    setHover(nearestIndex(tt, n, c.t0_us, c.t1_us));
  };

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`} className="w-full rounded-lg border border-border bg-bg text-ink touch-none"
      role="img" aria-label={`${t.tabStress}: ${c.peak_mv ?? ""} mV`}
      onPointerMove={onMove} onPointerLeave={() => setHover(null)}
    >
      {c.ev0_us !== null && c.ev1_us !== null && (
        <rect
          x={X(c.ev0_us)} y={PT} width={Math.max(2, X(c.ev1_us) - X(c.ev0_us))} height={ih}
          fill="currentColor" opacity="0.08"
        />
      )}
      {[-lim, -lim / 2, 0, lim / 2, lim].map((v) => (
        <g key={v}>
          <line x1={PL} x2={VW - PR} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeWidth={v === 0 ? 1.2 : 0.8} />
          <text className="font-mono" x={PL - 6} y={Y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink2)">
            {v}
          </text>
        </g>
      ))}
      {lvl > 0 && [lvl, -lvl].map((v) => (
        <line key={v} x1={PL} x2={VW - PR} y1={Y(v)} y2={Y(v)} stroke="var(--ink2)" strokeWidth="1" strokeDasharray="4 4" />
      ))}
      {c.t0_us < 0 && c.t1_us > 0 && (
        <line x1={X(0)} x2={X(0)} y1={PT} y2={PT + ih} stroke="var(--ink2)" strokeWidth="1" strokeDasharray="2 3" />
      )}
      {xTicks.map((tt) => (
        <text className="font-mono" key={tt} x={X(tt)} y={VH - 8} textAnchor="middle" fontSize="10" fill="var(--ink2)">
          {Math.round(tt)}
        </text>
      ))}
      <text className="font-mono" x={PL + iw} y={PT + 8} textAnchor="end" fontSize="9.5" fill="var(--ink2)">
        mV · {t.cavAxisTime}
      </text>
      <path d={d} fill="none" stroke={c.flagged ? "var(--amber)" : "currentColor"} strokeWidth="1.1" strokeLinejoin="round" />
      {hi !== null && (
        <g pointerEvents="none">
          <line x1={PL + (hi / (n - 1)) * iw} x2={PL + (hi / (n - 1)) * iw} y1={PT} y2={PT + ih} stroke="var(--ink2)" strokeWidth="0.8" />
          <circle cx={PL + (hi / (n - 1)) * iw} cy={Y(mv[hi])} r="3" fill="currentColor" />
          <text
            x={Math.min(VW - PR - 4, Math.max(PL + 4, PL + (hi / (n - 1)) * iw + 6))} y={PT + 22}
            fontSize="10.5" fill="currentColor"
          >
            {mv[hi].toFixed(1)} mV · {traceTime(hi, n, c.t0_us, c.t1_us).toFixed(1)} µs
          </text>
        </g>
      )}
    </svg>
  );
}
