"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STATUS_COLOR } from "@/lib/status";
import type { Strings } from "@/lib/dashboard/i18n";
import { bboxOfPoints, parsePathPoints, type Circuit, type Geo } from "@/lib/dashboard/geo";
import type { SensorDot } from "@/lib/dashboard/sim";
import type { DNode, Severity } from "@/lib/dashboard/types";
import { StatusPill, statusLabel } from "./ui";

type View = { x: number; y: number; w: number; h: number };
export type Layout = { dots: SensorDot[]; circuits: Circuit[] };
export type Readings = { moisture: number | null; airtemp: number | null; humidity: number | null; weight: number | null };

const SEVERITIES: Severity[] = ["critical", "warning", "good"];
const EMPTY: Layout = { dots: [], circuits: [] };

function niceScale(raw: number) {
  const exp = Math.floor(Math.log10(raw));
  const frac = raw / Math.pow(10, exp);
  const nice = frac < 1.5 ? 1 : frac < 3.5 ? 2 : frac < 7.5 ? 5 : 10;
  return nice * Math.pow(10, exp);
}

export default function MapView({
  geo, nodes, isLive, selectedId, filters, counts, t,
  onToggleFilter, onSelect, layoutFor, readingsFor, onViewFullSensor, compact = false,
}: {
  geo: Geo;
  nodes: DNode[];
  isLive: boolean;
  selectedId: string | null;
  filters: Record<Severity, boolean>;
  counts: Record<Severity, number>;
  t: Strings;
  onToggleFilter: (s: Severity) => void;
  onSelect: (id: string) => void;
  layoutFor: (n: DNode) => Layout;
  readingsFor: (n: DNode, d: SensorDot) => Readings;
  onViewFullSensor: (dotId: string) => void;
  // Read-only locator: no filters, zoom, pan, hover or popups. Always the full farm view.
  compact?: boolean;
}) {
  const full = useMemo<View>(() => ({ x: 0, y: 0, w: geo.width, h: geo.height }), [geo]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<View>(full);
  const animRef = useRef<number | null>(null);
  const dragMoved = useRef(false);

  const [view, setViewState] = useState<View>(full);
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const [shown, setShown] = useState<Layout>(EMPTY);
  const [popup, setPopup] = useState<{ x: number; y: number; dot: SensorDot; node: DNode } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; node: DNode } | null>(null);
  const [panning, setPanning] = useState(false);
  const [wrapW, setWrapW] = useState(0);

  const setView = useCallback((v: View) => { viewRef.current = v; setViewState(v); }, []);

  useEffect(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setView(full); setZoomedId(null); setShown(EMPTY); setPopup(null); setTip(null);
  }, [full, setView]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWrapW(el.getBoundingClientRect().width));
    ro.observe(el);
    setWrapW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const clamp = useCallback((v: View): View => {
    const w = Math.min(v.w, full.w), h = Math.min(v.h, full.h), m = 0.4;
    const minX = full.x - w * m, maxX = full.x + full.w - w * (1 - m);
    const minY = full.y - h * m, maxY = full.y + full.h - h * (1 - m);
    return { w, h, x: Math.max(minX, Math.min(maxX, v.x)), y: Math.max(minY, Math.min(maxY, v.y)) };
  }, [full]);

  const animateTo = useCallback((target: View, done?: () => void) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const start = viewRef.current;
    const t0 = performance.now(), dur = 420;
    const step = (now: number) => {
      const f = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - f, 3);
      setView({
        x: start.x + (target.x - start.x) * e, y: start.y + (target.y - start.y) * e,
        w: start.w + (target.w - start.w) * e, h: start.h + (target.h - start.h) * e,
      });
      if (f < 1) animRef.current = requestAnimationFrame(step);
      else { animRef.current = null; done?.(); }
    };
    animRef.current = requestAnimationFrame(step);
  }, [setView]);

  const resetView = useCallback(() => {
    setZoomedId(null); setShown(EMPTY); setPopup(null);
    animateTo(full);
  }, [animateTo, full]);

  const zoomTo = useCallback((n: DNode) => {
    const bb = bboxOfPoints(parsePathPoints(n.path));
    const w = bb.maxx - bb.minx, h = bb.maxy - bb.miny;
    const pad = Math.max(w, h) * 0.4;
    let tw = w + pad * 2, th = h + pad * 2;
    const aspect = geo.width / geo.height;
    if (tw / th > aspect) th = tw / aspect; else tw = th * aspect;
    const cx = (bb.minx + bb.maxx) / 2, cy = (bb.miny + bb.maxy) / 2;
    setZoomedId(n.id); setPopup(null); setShown(EMPTY);
    const layout = layoutFor(n);
    animateTo({ x: cx - tw / 2, y: cy - th / 2, w: tw, h: th }, () => setShown(layout));
  }, [animateTo, geo, layoutFor]);

  // wheel zoom (needs a non-passive listener to preventDefault)
  useEffect(() => {
    const wrap = wrapRef.current, svg = svgRef.current;
    if (!wrap || !svg || compact) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      setPopup(null);
      const v = viewRef.current;
      const rect = svg.getBoundingClientRect();
      const mx = (ev.clientX - rect.left) / rect.width, my = (ev.clientY - rect.top) / rect.height;
      const sx = v.x + mx * v.w, sy = v.y + my * v.h;
      const factor = ev.deltaY > 0 ? 1.15 : 1 / 1.15;
      const nw = Math.max(full.w * 0.06, Math.min(full.w, v.w * factor));
      const nh = nw * (full.h / full.w);
      setView(clamp({ x: sx - mx * nw, y: sy - my * nh, w: nw, h: nh }));
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [full, clamp, setView, compact]);

  // drag to pan
  useEffect(() => {
    let dragging = false, lx = 0, ly = 0;
    const wrap = wrapRef.current;
    if (!wrap || compact) return;
    const down = (ev: MouseEvent) => {
      if ((ev.target as Element).closest?.("[data-popup]")) return;
      dragging = true; dragMoved.current = false; lx = ev.clientX; ly = ev.clientY;
      setPanning(true); setPopup(null);
    };
    const move = (ev: MouseEvent) => {
      if (!dragging) return;
      const dx = ev.clientX - lx, dy = ev.clientY - ly;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved.current = true;
      if (dragMoved.current && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const v = viewRef.current;
        setView(clamp({ ...v, x: v.x - (dx / rect.width) * v.w, y: v.y - (dy / rect.height) * v.h }));
      }
      lx = ev.clientX; ly = ev.clientY;
    };
    const up = () => {
      if (!dragging) return;
      dragging = false; setPanning(false);
      setTimeout(() => { dragMoved.current = false; }, 0);
    };
    wrap.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      wrap.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [clamp, setView, compact]);

  const rel = (ev: React.MouseEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  const dotR = Math.max(3, view.w * 0.012);
  const lineW = Math.max(1.2, view.w * 0.0028);
  const showReset = !compact && (!!zoomedId || view.w < full.w * 0.985);
  const metersPerPx = wrapW ? view.w / wrapW : 1;
  const niceM = niceScale(110 * metersPerPx);
  const barPx = niceM / metersPerPx;
  const river = geo.farmPoints.length >= 6
    ? "M " + [1, 2, 3, 4, 5].map((i) => geo.farmPoints[i].join(",")).join(" L ")
    : null;

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden rounded-xl border border-border bg-bg min-[901px]:h-full ${
        compact ? "cursor-default" : panning ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      {!isLive && !compact && (
        <div className="absolute left-2.5 top-2.5 z-[4] flex max-w-[calc(100%-90px)] flex-wrap gap-1.5">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              onClick={() => onToggleFilter(s)}
              className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-2.5 py-1 font-mono text-[11.5px] font-semibold shadow-md ${
                filters[s] ? "bg-surface text-ink opacity-100" : "border-border bg-bg text-ink2 opacity-55"
              }`}
              style={filters[s] ? { borderColor: STATUS_COLOR[s] } : undefined}
            >
              <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: STATUS_COLOR[s] }} />
              {statusLabel(s, t)} ({counts[s]})
            </button>
          ))}
        </div>
      )}

      {showReset && (
        <button
          onClick={(e) => { e.stopPropagation(); resetView(); }}
          className={`absolute right-3.5 z-[4] rounded-lg border border-border bg-surface px-3 py-1.5 text-[11.5px] font-semibold text-ink shadow-md ${isLive ? "top-3.5" : "top-[58px]"}`}
        >
          {t.resetView}
        </button>
      )}

      <svg
        ref={svgRef}
        viewBox={`${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.w.toFixed(2)} ${view.h.toFixed(2)}`}
        className="block h-auto w-full min-[901px]:h-full"
        onClick={(e) => {
          if (compact || dragMoved.current) return;
          if ((e.target as Element).closest?.(".cuartel-cell")) return;
          resetView();
        }}
      >
        {!isLive && river && (
          <>
            <path d={river} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={9} opacity={0.5} style={{ stroke: "var(--river)" }} />
            <path d={river} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} opacity={0.8} style={{ stroke: "var(--river)" }} />
          </>
        )}
        <path d={geo.farmPath} fill="none" strokeWidth={1.5} opacity={0.5} style={{ stroke: "var(--ink)" }} />

        {nodes.map((n) => {
          const dimmed = !isLive && n.status !== "idle" && !filters[n.status];
          const selected = selectedId === n.id;
          return (
            <path
              key={n.id}
              d={n.path}
              className="cuartel-cell cursor-pointer transition-opacity duration-100 hover:opacity-80"
              style={{
                fill: n.status === "good" || n.status === "idle"
                  ? "var(--map-ok)"
                  : `color-mix(in srgb, ${STATUS_COLOR[n.status]} 85%, var(--bg))`,
                stroke: selected ? "var(--ink)" : "var(--bg)",
                strokeWidth: selected ? 3.5 : 2.5,
                opacity: dimmed ? 0.22 : undefined,
              }}
              onMouseMove={compact ? undefined : (ev) => setTip({ ...rel(ev), node: n })}
              onMouseLeave={compact ? undefined : () => setTip(null)}
              onClick={(ev) => {
                if (dragMoved.current) return;
                ev.stopPropagation();
                onSelect(n.id);
                // Compact is a fixed locator: select, but never zoom in (there is no room
                // to show sensor dots there, and the enlarge popover is what zooming is for).
                if (!compact) zoomTo(n);
              }}
            />
          );
        })}

        {shown.circuits.map((c, i) => (
          <line
            key={i} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} strokeLinecap="round" opacity={0.7}
            strokeDasharray="5,3" style={{ stroke: "var(--ink2)", strokeWidth: lineW }}
          />
        ))}
        {shown.dots.map((d) => (
          <circle
            key={d.id} cx={d.x} cy={d.y} r={dotR} className="cursor-pointer"
            style={{ fill: STATUS_COLOR[d.status], stroke: "var(--bg)", strokeWidth: 1.5 }}
            onClick={(ev) => {
              ev.stopPropagation();
              const n = nodes.find((x) => x.id === zoomedId);
              if (n) setPopup({ ...rel(ev), dot: d, node: n });
            }}
          />
        ))}
      </svg>

      {tip && !compact && (
        <div
          className="pointer-events-none absolute z-[5] whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-[7px] text-xs shadow-lg"
          style={{ left: tip.x + 14, top: tip.y - 10 }}
        >
          <div className="font-mono font-bold">{tip.node.label}</div>
          <div className="mt-0.5 text-ink2">
            {tip.node.area !== null ? `${tip.node.area.toFixed(2)} ha · ` : ""}
            {statusLabel(tip.node.status, t)}
            {tip.node.variety ? ` · ${tip.node.variety}` : ""}
          </div>
        </div>
      )}

      {!isLive && !compact && (
        <>
          <div className="pointer-events-none absolute right-3.5 top-3 z-[4] flex flex-col items-center font-mono text-[11px] font-bold text-ink2">
            <svg width="18" height="26" viewBox="0 0 18 26"><path d="M9,0 L16,20 L9,15 L2,20 Z" fill="currentColor" /></svg>
            N
          </div>
          <div className="pointer-events-none absolute bottom-2.5 left-3 z-[4] text-center">
            <div className="mb-[5px] font-mono text-[10px] font-semibold text-ink2">
              {niceM >= 1000 ? `${niceM / 1000} km` : `${niceM} m`}
            </div>
            <div className="relative h-[3px] bg-ink2" style={{ width: barPx }}>
              <span className="absolute -top-1 left-0 h-[11px] w-[1.5px] bg-ink2" />
              <span className="absolute -top-1 right-0 h-[11px] w-[1.5px] bg-ink2" />
            </div>
          </div>
        </>
      )}

      {!compact && (
        <div
          className={`pointer-events-none absolute bottom-2.5 right-3.5 z-[4] rounded-lg border border-border bg-surface px-[9px] py-1 text-[10.5px] font-semibold text-ink2 transition-opacity duration-150 ${
            zoomedId && !isLive ? "opacity-100" : "opacity-0"
          }`}
        >
          {t.circuitLegend}
        </div>
      )}

      {popup && !compact && (
        <div
          data-popup
          className="absolute z-[6] min-w-40 rounded-[10px] border border-border bg-surface px-3 py-2.5 text-xs shadow-xl"
          style={{
            left: Math.min(popup.x + 12, Math.max(8, wrapW - 180)),
            top: Math.max(8, popup.y - 10),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2 font-mono font-bold">
            <span className="flex items-center gap-1.5">
              {popup.dot.label}
              <StatusPill status={popup.dot.status} t={t} />
            </span>
            <button onClick={() => setPopup(null)} className="px-0.5 text-sm leading-none text-ink2">&times;</button>
          </div>
          {!isLive && (
            <PopRow k={t.circuit} v={String.fromCharCode(65 + popup.dot.circuitIdx)} />
          )}
          {(() => {
            const r = readingsFor(popup.node, popup.dot);
            const f = (v: number | null, d: number) => (v === null ? "-" : v.toFixed(d));
            return (
              <>
                <PopRow k={t.moisture} v={`${f(r.moisture, 0)}%`} />
                <PopRow k={t.airtemp} v={`${f(r.airtemp, 1)}°C`} />
                <PopRow k={t.humidity} v={`${f(r.humidity, 0)}%`} />
                <PopRow k={t.weight} v={`${f(r.weight, 2)}kg`} />
              </>
            );
          })()}
          <button
            onClick={() => { onViewFullSensor(popup.dot.id); setPopup(null); }}
            className="mt-2 block w-full border-t border-border pt-2 text-left text-[11.5px] font-semibold text-accent"
          >
            {t.viewFullSensor} →
          </button>
        </div>
      )}
    </div>
  );
}

function PopRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2.5 py-[3px] text-ink2">
      <span>{k}</span>
      <b className="font-mono text-ink">{v}</b>
    </div>
  );
}
