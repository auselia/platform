"use client";

import { useState } from "react";
import type { Strings } from "@/lib/dashboard/i18n";
import { fmtTick, niceTicks, type Spectrum } from "@/lib/dashboard/dsp";
import { useCanvas } from "./use-canvas";

const PL = 52, PR = 16, PT = 14, PB = 26;
const MONO = "ui-monospace, 'IBM Plex Mono', Menlo, monospace";
const dbOf = (a: number) => 20 * Math.log10(Math.max(a, 1e-6));

// Index of the bin nearest to a frequency (kHz).
const nearest = (f: number[], khz: number) => {
  let b = 0;
  for (let k = 1; k < f.length; k++) if (Math.abs(f[k] - khz) < Math.abs(f[b] - khz)) b = k;
  return b;
};

export default function SpectrumCanvas({
  sp, db, t, onCanvas,
}: {
  sp: Spectrum; db: boolean; t: Strings;
  onCanvas?: (el: HTMLCanvasElement | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const tr = (a: number) => (db ? dbOf(a) : a);

  const { attach } = useCanvas((g, w, h, col) => {
    const pw = w - PL - PR, ph = h - PT - PB;
    const f = sp.f, a = sp.a.map(tr), r = sp.ref ? sp.ref.map(tr) : null;
    const x0 = f[0], x1 = f[f.length - 1];
    let lo = db ? Infinity : 0, hi = -Infinity;
    for (const v of a.concat(r ?? [])) { if (v > hi) hi = v; if (v < lo) lo = v; }
    if (db) lo = Math.max(lo, hi - 80);
    hi += (hi - lo) * 0.08;
    const X = (v: number) => PL + pw * (f.length > 1 ? (v - x0) / (x1 - x0) : 0);
    const Y = (v: number) => PT + ph * (1 - (v - lo) / (hi - lo || 1));

    g.font = `11px ${MONO}`; g.lineWidth = 1;
    g.strokeStyle = col.line; g.fillStyle = col.ink2;
    const yt = niceTicks(lo, hi, 6), xt = niceTicks(x0, x1, Math.max(3, Math.floor(pw / 90)));
    g.textAlign = "right";
    for (const v of yt.ticks) {
      if (v < lo || v > hi) continue;
      g.beginPath(); g.moveTo(PL, Y(v)); g.lineTo(PL + pw, Y(v)); g.stroke();
      g.fillText(fmtTick(v, yt.step), PL - 5, Y(v) + 4);
    }
    g.textAlign = "center";
    for (const v of xt.ticks) {
      g.beginPath(); g.moveTo(X(v), PT); g.lineTo(X(v), PT + ph); g.stroke();
      g.fillText(fmtTick(v, xt.step), X(v), h - 8);
    }
    g.textAlign = "left";
    g.fillText(db ? "kHz / dB re 1 mV" : "kHz / mV (peak)", PL + 4, PT + 11);

    g.save();
    g.beginPath(); g.rect(PL, PT, pw, ph); g.clip();
    if (r) {
      g.strokeStyle = col.ink2; g.lineWidth = 1.3; g.setLineDash([5, 3]); g.beginPath();
      r.forEach((v, i) => (i ? g.lineTo(X(f[i]), Y(v)) : g.moveTo(X(f[i]), Y(v))));
      g.stroke(); g.setLineDash([]);
    }
    g.strokeStyle = col.accent; g.lineWidth = 1.6; g.beginPath();
    a.forEach((v, i) => (i ? g.lineTo(X(f[i]), Y(v)) : g.moveTo(X(f[i]), Y(v))));
    g.stroke();
    g.restore();

    g.fillStyle = col.ink; g.textAlign = "center";
    for (const p of sp.peaks.slice(0, 3)) {
      const j = nearest(f, p.f_khz), x = X(f[j]), y = Y(a[j]);
      g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill();
      g.fillText(`${p.f_khz.toFixed(1)} kHz`, Math.min(Math.max(x, PL + 34), PL + pw - 34), Math.max(y - 8, PT + 22));
    }
    if (hover !== null) {
      g.strokeStyle = col.ink2; g.globalAlpha = 0.6;
      g.beginPath(); g.moveTo(X(f[hover]), PT); g.lineTo(X(f[hover]), PT + ph); g.stroke(); g.globalAlpha = 1;
    }
  }, onCanvas);

  return (
    <div>
      <canvas
        ref={attach}
        role="img" aria-label={t.dlgSpec}
        className="block h-[min(46vh,420px)] min-h-[240px] w-full rounded-lg border border-border bg-bg"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const fr = (e.clientX - r.left - PL) / (r.width - PL - PR);
          setHover(fr < 0 || fr > 1 ? null : Math.round(fr * (sp.f.length - 1)));
        }}
        onPointerLeave={() => setHover(null)}
      />
      <div className="mt-1.5 min-h-4 font-mono text-[11.5px] text-ink2">
        {hover !== null &&
          `${t.dlgCursor} ${sp.f[hover].toFixed(1)} kHz · ${sp.a[hover].toFixed(3)} mV (${dbOf(sp.a[hover]).toFixed(1)} dB)` +
          (sp.ref ? ` · ${t.spNoiseWord} ${sp.ref[hover].toFixed(3)} mV` : "")}
      </div>
    </div>
  );
}

