"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Cavitation, CavitationSummary } from "@/lib/types";
import type { Lang, Strings } from "@/lib/dashboard/i18n";
import { CLASS_KEY, nearestIndex, niceLimit, traceMv, traceTime } from "@/lib/dashboard/cavitation";
import { Segmented, relTime } from "./ui";

const PAGE = 40;
const POLL_MS = 20_000;
// Everything except the trace: the list stays light and the trace loads on demand.
const COLS =
  "id,plant_id,capture_key,ts,cls,level_mv,peak_mv,snr,dur_us,swings,freq_khz,clipped,t0_us,t1_us,ev0_us,ev1_us,flagged,flag_note";

type Filter = "all" | "flagged";

export default function CavitationTab({
  plantId, t, lang, canFlag,
}: {
  plantId: string; t: Strings; lang: Lang; canFlag: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const locale = lang === "es" ? "es-CL" : undefined;

  const [items, setItems] = useState<Cavitation[]>([]);
  const [summary, setSummary] = useState<CavitationSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [traces, setTraces] = useState<Record<number, number[]>>({});
  const traceAsked = useRef(new Set<number>());

  const load = useCallback(async () => {
    const [list, sum] = await Promise.all([
      supabase.from("cavitation_captures").select(COLS).eq("plant_id", plantId)
        .order("ts", { ascending: false }).limit(PAGE),
      supabase.from("cavitation_summary").select("*").eq("plant_id", plantId).maybeSingle(),
    ]);
    if (list.error || sum.error) { setFailed(true); setLoaded(true); return; }
    setFailed(false);
    const fresh = (list.data ?? []) as Cavitation[];
    // Merge: keep older pages already loaded, replace the newest page with fresh data.
    setItems((old) => {
      const seen = new Set(fresh.map((x) => x.id));
      const oldest = fresh.length ? fresh[fresh.length - 1].ts : "";
      const kept = old.filter((x) => !seen.has(x.id) && x.ts < oldest);
      return [...fresh, ...kept];
    });
    setHasMore((prev) => (prev && !fresh.length ? prev : fresh.length === PAGE || prev));
    setSummary((sum.data as CavitationSummary | null) ?? null);
    setLoaded(true);
  }, [supabase, plantId]);

  useEffect(() => {
    let alive = true;
    const run = () => { if (alive) void load(); };
    run();
    const id = setInterval(run, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [load]);

  const older = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    const r = await supabase.from("cavitation_captures").select(COLS).eq("plant_id", plantId)
      .lt("ts", last.ts).order("ts", { ascending: false }).limit(PAGE);
    if (r.error) return;
    const more = (r.data ?? []) as Cavitation[];
    setItems((old) => [...old, ...more]);
    setHasMore(more.length === PAGE);
  };

  const visible = useMemo(() => (filter === "flagged" ? items.filter((x) => x.flagged) : items), [items, filter]);
  const selected = visible.find((x) => x.id === selectedId) ?? visible[0] ?? null;
  const selId = selected?.id ?? null;

  useEffect(() => {
    if (selId === null || traceAsked.current.has(selId)) return;
    traceAsked.current.add(selId);
    supabase.from("cavitation_captures").select("y").eq("id", selId).maybeSingle().then(({ data }) => {
      if (data?.y) setTraces((tr) => ({ ...tr, [selId]: data.y as number[] }));
      else traceAsked.current.delete(selId);
    });
  }, [supabase, selId]);

  const saveFlag = async (c: Cavitation, flagged: boolean, note: string) => {
    const patch = { flagged, flag_note: flagged ? note : "", flagged_at: flagged ? new Date().toISOString() : null };
    const { error } = await supabase.from("cavitation_captures").update(patch).eq("id", c.id);
    if (error) return false;
    setItems((all) => all.map((x) => (x.id === c.id ? { ...x, flagged, flag_note: patch.flag_note } : x)));
    void load();
    return true;
  };

  if (!loaded) return <div className="text-xs text-ink2">{t.loading}…</div>;
  if (failed && !items.length) return <div className="text-xs text-ink2">{t.cavLoadFailed}</div>;

  const tiles: [string, string][] = [
    [t.cavLast24h, String(summary?.last_24h ?? 0)],
    [t.cavLast7d, String(summary?.last_7d ?? 0)],
    [t.cavFlagged, String(summary?.flagged ?? 0)],
    [t.cavLastCapture, summary?.last_capture_at ? relTime(new Date(summary.last_capture_at), t) : "-"],
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-[10px] border border-border px-3.5 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.04em] text-ink2">{k}</div>
            <div className="mt-[3px] font-mono text-[17px] font-semibold">{v}</div>
          </div>
        ))}
      </div>

      {!items.length ? (
        <div className="rounded-[10px] border border-dashed border-border px-3.5 py-6 text-center text-[12.5px] text-ink2">
          {t.cavNone}
        </div>
      ) : (
        <>
          {selected ? (
            <Viewer
              key={selected.id} c={selected} y={traces[selected.id]} t={t} locale={locale}
              canFlag={canFlag} onFlag={saveFlag}
            />
          ) : (
            <div className="text-xs text-ink2">{t.cavSelect}</div>
          )}

          <div className="flex items-center justify-between gap-2">
            <Segmented
              value={filter} onChange={setFilter}
              options={[{ value: "all", label: t.cavAll }, { value: "flagged", label: t.cavOnlyFlagged }]}
            />
          </div>

          {!visible.length ? (
            <div className="text-xs text-ink2">{t.cavNoneFlagged}</div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {visible.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    aria-current={c.id === selId}
                    className={`grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 rounded-lg border px-3 py-2 text-left text-xs ${
                      c.id === selId ? "border-accent bg-surface-2" : "border-border hover:bg-surface-2"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {c.flagged ? <FlagMark title={t.cavFlagged} /> : <span className="inline-block w-3" />}
                      <span className="font-mono">
                        {new Date(c.ts).toLocaleString(locale, {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </span>
                    </span>
                    <span className="text-ink2">{t[CLASS_KEY[c.cls]]}</span>
                    <span className="w-16 text-right font-mono">{c.peak_mv !== null ? `${c.peak_mv} mV` : "-"}</span>
                    <span className="w-16 text-right font-mono text-ink2">
                      {c.freq_khz !== null ? `${c.freq_khz} kHz` : "-"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasMore && filter === "all" && (
            <button onClick={older} className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink2">
              {t.cavOlder}
            </button>
          )}
          <div className="text-[11px] text-ink2">{t.cavClsHint}</div>
        </>
      )}
    </>
  );
}

// Amber is reserved for signal. A flagged capture is the strongest signal we have.
function FlagMark({ title }: { title: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" role="img" aria-label={title} className="flex-none text-amber">
      <title>{title}</title>
      <circle cx="6" cy="6" r="3.2" fill="currentColor" />
      <circle cx="6" cy="6" r="5.4" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.55" />
    </svg>
  );
}

function Viewer({
  c, y, t, locale, canFlag, onFlag,
}: {
  c: Cavitation; y: number[] | undefined; t: Strings; locale: string | undefined; canFlag: boolean;
  onFlag: (c: Cavitation, flagged: boolean, note: string) => Promise<boolean>;
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

      <div className="grid grid-cols-3 gap-1.5">
        {metrics.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border px-2.5 py-1.5">
            <div className="text-[9.5px] uppercase tracking-[0.04em] text-ink2">{k}</div>
            <div className="mt-0.5 font-mono text-[13px] font-semibold">{v}</div>
          </div>
        ))}
      </div>
      {c.clipped && <div className="text-[11.5px] text-ink2">{t.cavClipped}</div>}

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
      role="img" aria-label={`${t.tabCav}: ${c.peak_mv ?? ""} mV`}
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
