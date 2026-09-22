"use client";

import { useEffect, useRef, useState } from "react";
import type { Cavitation } from "@/lib/types";
import type { Strings } from "@/lib/dashboard/i18n";
import { envelope, fmtTick, niceTicks, sliceRange, timeAt, type Signal } from "@/lib/dashboard/dsp";
import { useCanvas } from "./use-canvas";

export type Range = [number, number];
export type Mode = "pan" | "select";

const PL = 52, PR = 12, PT = 14, PB = 26;
const MONO = "ui-monospace, 'IBM Plex Mono', Menlo, monospace";

// Full extent of a signal in µs.
export const fullRange = (s: Signal): Range => [s.t0_us, timeAt(s, s.mv.length - 1)];

// Keep a view inside the record and at least 20 samples wide.
export function clampView(s: Signal, a: number, b: number): Range {
  const [w0, w1] = fullRange(s);
  const sp = Math.min(Math.max(b - a, s.dt_us * 20), w1 - w0);
  const c = (a + b) / 2;
  a = c - sp / 2; b = c + sp / 2;
  if (a < w0) { b += w0 - a; a = w0; }
  if (b > w1) { a -= b - w1; b = w1; }
  return [Math.max(a, w0), Math.min(b, w1)];
}

export default function SignalCanvas({
  sig, c, t, view, onView, sel, onSel, mode, onCanvas,
}: {
  sig: Signal; c: Cavitation; t: Strings;
  view: Range; onView: (v: Range) => void;
  sel: Range | null; onSel: (s: Range | null) => void;
  mode: Mode;
  onCanvas?: (el: HTMLCanvasElement | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [dragSel, setDragSel] = useState<Range | null>(null);
  const drag = useRef<{ sel: boolean; x: number; t: number; v0: Range; moved: boolean } | null>(null);
  const live = useRef({ view, sig });
  useEffect(() => { live.current = { view, sig }; });

  const shown = dragSel ?? sel;

  const { ref, attach } = useCanvas((g, w, h, col) => {
    const pw = w - PL - PR, ph = h - PT - PB;
    const [x0, x1] = view;
    const px = (tt: number) => PL + (pw * (tt - x0)) / (x1 - x0);
    const [i0, i1] = sliceRange(sig, x0, x1);
    const cols = Math.max(2, Math.floor(pw));
    const dense = i1 - i0 > 2 * cols;
    const env = dense ? envelope(sig, x0, x1, cols) : null;

    let lo = Infinity, hi = -Infinity;
    if (env) {
      for (let k = 0; k < cols; k++) { if (env.lo[k] < lo) lo = env.lo[k]; if (env.hi[k] > hi) hi = env.hi[k]; }
    } else {
      for (let i = i0; i < i1; i++) { const v = sig.mv[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (!isFinite(lo)) { lo = -10; hi = 10; }
    const span0 = hi - lo || 1;
    const lvl = c.level_mv ?? 0;
    if (lvl && lvl > lo - span0 * 2 && lvl < hi + span0 * 2) { lo = Math.min(lo, lvl); hi = Math.max(hi, lvl); }
    const pad = (hi - lo || 1) * 0.08;
    lo -= pad; hi += pad;
    const Y = (v: number) => PT + ph * (1 - (v - lo) / (hi - lo));

    g.font = `11px ${MONO}`;
    g.lineWidth = 1;
    g.strokeStyle = col.line; g.fillStyle = col.ink2;
    const yt = niceTicks(lo, hi, 6), xt = niceTicks(x0, x1, Math.max(3, Math.floor(pw / 110)));
    g.textAlign = "right";
    for (const v of yt.ticks) {
      g.beginPath(); g.moveTo(PL, Y(v)); g.lineTo(PL + pw, Y(v)); g.stroke();
      g.fillText(fmtTick(v, yt.step), PL - 5, Y(v) + 4);
    }
    g.textAlign = "center";
    for (const v of xt.ticks) {
      g.beginPath(); g.moveTo(px(v), PT); g.lineTo(px(v), PT + ph); g.stroke();
      g.fillText(fmtTick(v, xt.step), px(v), h - 8);
    }
    g.textAlign = "left";
    g.fillText("µs / mV", PL + 4, PT + 11);

    if (c.ev0_us !== null && c.ev1_us !== null) {
      g.fillStyle = c.flagged ? col.amber : col.sage;
      g.globalAlpha = 0.2;
      g.fillRect(px(c.ev0_us), PT, Math.max(px(c.ev1_us) - px(c.ev0_us), 2), ph);
      g.globalAlpha = 1;
    }
    if (shown) {
      const a = px(shown[0]), b = px(shown[1]);
      g.fillStyle = col.accent; g.globalAlpha = 0.16; g.fillRect(a, PT, b - a, ph); g.globalAlpha = 1;
      g.strokeStyle = col.accent;
      g.beginPath(); g.moveTo(a, PT); g.lineTo(a, PT + ph); g.moveTo(b, PT); g.lineTo(b, PT + ph); g.stroke();
    }

    g.save();
    g.beginPath(); g.rect(PL, PT, pw, ph); g.clip();
    if (lvl) {
      g.strokeStyle = col.sage; g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(PL, Y(lvl)); g.lineTo(PL + pw, Y(lvl)); g.stroke(); g.setLineDash([]);
    }
    g.strokeStyle = col.ink2; g.globalAlpha = 0.5;
    g.beginPath(); g.moveTo(px(0), PT); g.lineTo(px(0), PT + ph); g.stroke(); g.globalAlpha = 1;

    g.strokeStyle = col.accent; g.lineWidth = 1.3; g.beginPath();
    if (env) {
      // One vertical stroke per pixel column, from the lowest to the highest sample in it.
      for (let k = 0; k < cols; k++) {
        if (Number.isNaN(env.lo[k])) continue;
        const X = PL + (pw * (k + 0.5)) / cols;
        g.moveTo(X, Y(env.lo[k])); g.lineTo(X, Y(env.hi[k]) - 0.01);
      }
    } else {
      for (let i = Math.max(0, i0 - 1); i < Math.min(sig.mv.length, i1 + 1); i++) {
        const X = px(timeAt(sig, i)), V = Y(sig.mv[i]);
        if (i === Math.max(0, i0 - 1)) g.moveTo(X, V); else g.lineTo(X, V);
      }
    }
    g.stroke();
    if (!env && i1 - i0 < pw / 5) {
      g.fillStyle = col.accent;
      for (let i = i0; i < i1; i++) { g.beginPath(); g.arc(px(timeAt(sig, i)), Y(sig.mv[i]), 2, 0, 7); g.fill(); }
    }
    g.restore();

    if (hover !== null && !drag.current && i1 > i0) {
      const j = Math.min(sig.mv.length - 1, Math.max(0, Math.round((hover - sig.t0_us) / sig.dt_us)));
      g.strokeStyle = col.ink2; g.globalAlpha = 0.6; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(px(timeAt(sig, j)), PT); g.lineTo(px(timeAt(sig, j)), PT + ph);
      g.moveTo(PL, Y(sig.mv[j])); g.lineTo(PL + pw, Y(sig.mv[j]));
      g.stroke(); g.globalAlpha = 1;
    }
  }, onCanvas);

  const tAt = (e: { clientX: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return view[0] + ((e.clientX - r.left - PL) / (r.width - PL - PR)) * (view[1] - view[0]);
  };

  // Wheel zoom around the cursor. Needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view: v, sig: s } = live.current;
      const r = cv.getBoundingClientRect();
      const tt = v[0] + ((e.clientX - r.left - PL) / (r.width - PL - PR)) * (v[1] - v[0]);
      const k = Math.pow(1.0018, e.deltaY);
      onView(clampView(s, tt - (tt - v[0]) * k, tt + (v[1] - tt) * k));
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, [ref, onView]);

  const lastHover = hover !== null ? Math.min(sig.mv.length - 1, Math.max(0, Math.round((hover - sig.t0_us) / sig.dt_us))) : null;
  const [i0, i1] = sliceRange(sig, view[0], view[1]);

  return (
    <div>
      <canvas
        ref={attach}
        role="img" aria-label={t.dlgWave}
        className={`block h-[min(46vh,420px)] min-h-[240px] w-full touch-none rounded-lg border border-border bg-bg ${
          mode === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
        }`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { sel: mode === "select" || e.shiftKey, x: e.clientX, t: tAt(e), v0: view, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) { setHover(tAt(e)); return; }
          if (Math.abs(e.clientX - d.x) > 3) d.moved = true;
          if (d.sel) {
            if (d.moved) { const tt = tAt(e); setDragSel([Math.min(d.t, tt), Math.max(d.t, tt)]); }
          } else {
            const r = e.currentTarget.getBoundingClientRect();
            const dt = ((e.clientX - d.x) / (r.width - PL - PR)) * (d.v0[1] - d.v0[0]);
            onView(clampView(sig, d.v0[0] - dt, d.v0[1] - dt));
          }
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d?.sel) {
            const s = dragSel;
            setDragSel(null);
            onSel(d.moved && s && s[1] - s[0] > sig.dt_us ? s : null);
          }
        }}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={() => onView(fullRange(sig))}
      />
      <div className="mt-1.5 font-mono text-[11.5px] text-ink2" aria-live="off">
        {lastHover !== null
          ? `${t.dlgCursor} ${timeAt(sig, lastHover).toFixed(3)} µs · ${sig.mv[lastHover].toFixed(2)} mV · `
          : ""}
        {`${t.dlgViewWord} ${view[0].toFixed(2)} to ${view[1].toFixed(2)} µs (${(view[1] - view[0]).toFixed(2)} µs) · `}
        {`${(i1 - i0).toLocaleString()} ${t.dlgSamples}`}
      </div>
    </div>
  );
}
