"use client";

import { useState } from "react";
import type { Reading } from "@/lib/types";
import type { Lang, Strings } from "@/lib/dashboard/i18n";
import type { EnvKey, EnvSeries, Range } from "@/lib/dashboard/env";
import type { SensorDot } from "@/lib/dashboard/sim";
import type { Geo } from "@/lib/dashboard/geo";
import type { DNode, Severity } from "@/lib/dashboard/types";
import { useCavitationData } from "@/lib/dashboard/use-cavitation-data";
import { STATUS_COLOR } from "@/lib/status";
import StatusIcon from "@/components/status-icon";
import { StatusPill, Segmented } from "./ui";
import { ENV_KEYS, lastNonNull } from "@/lib/dashboard/env";
import LineChart from "./line-chart";
import DayPicker from "./day-picker";
import MapPanel from "./map-panel";
import CavitationGrid from "./cavitation-grid";
import CavitationDetails from "./cavitation-details";
import CavitationDialog from "./cavitation-dialog";
import type { PanelTab } from "./metrics-panel";
import type { Layout } from "./map-view";

// The 3-column layout that replaces the classic MapView+MetricsPanel grid once the
// Environment or Cavitations tab is active: a range/day picker and a small locator map on
// the left, the chart or capture grid center stage, and the selected thing's details on the
// right. Desktop only (min-[1040px]); below that it falls back to a plain stacked column.
export default function FocusShell({
  node, t, lang, isLive, tab, onTab, canEditIrrigation,
  sensors, panelSensor, onPanelSensor,
  dates, env, envVar, onEnvVar, range, onRange, loading,
  rows, anchorMs, dayAnchor, onDayAnchor, lastUpdated,
  geo, nodes, selectedId, filters, counts, onToggleFilter, onSelect, layoutFor,
}: {
  node: DNode; t: Strings; lang: Lang; isLive: boolean;
  tab: "env" | "cav"; onTab: (t: PanelTab) => void; canEditIrrigation: boolean;
  sensors: SensorDot[]; panelSensor: string | null; onPanelSensor: (id: string | null) => void;
  dates: Date[]; env: EnvSeries; envVar: EnvKey; onEnvVar: (k: EnvKey) => void;
  range: Range; onRange: (r: Range) => void; loading: boolean;
  rows: Reading[]; anchorMs: number; dayAnchor: Date | null; onDayAnchor: (d: Date | null) => void;
  lastUpdated: string | null;
  geo: Geo; nodes: DNode[]; selectedId: string | null;
  filters: Record<Severity, boolean>; counts: Record<Severity, number>;
  onToggleFilter: (s: Severity) => void; onSelect: (id: string) => void;
  layoutFor: (n: DNode) => Layout;
}) {
  const locale = lang === "es" ? "es-CL" : undefined;
  const cav = useCavitationData(node.id, dayAnchor, range);
  const [dialogOpen, setDialogOpen] = useState(false);

  const tabs: { id: PanelTab; label: string }[] = isLive
    ? [{ id: "env", label: t.tabEnv }, { id: "cav", label: t.tabCav }, ...(canEditIrrigation ? [{ id: "irr" as const, label: t.tabIrr }] : [])]
    : [{ id: "ae" as const, label: t.tabAe }, { id: "env", label: t.tabEnv }, { id: "events" as const, label: t.tabEvents }];

  const sourceLabel = panelSensor ? `${node.label} · ${sensors.find((s) => s.id === panelSensor)?.label ?? ""}` : node.label;
  const meta = ENV_KEYS.find((v) => v.key === envVar)!;
  const pairs: { d: Date; v: number }[] = [];
  (env[envVar] ?? []).forEach((v, i) => {
    if (v !== null && v !== undefined && !Number.isNaN(v) && dates[i]) pairs.push({ d: dates[i], v });
  });
  const labels = pairs.map(({ d }) =>
    range === "day"
      ? d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(locale, { month: "short", day: "numeric" }));

  return (
    <div
      className="grid grid-cols-1 gap-[18px] min-[901px]:min-h-0 min-[901px]:flex-1 min-[901px]:overflow-y-auto
      min-[1040px]:grid-cols-[minmax(210px,23%)_minmax(0,1fr)_minmax(230px,24%)] min-[1040px]:grid-rows-[auto_minmax(0,1fr)]"
      // TODO: tighten the 901-1039px and mobile stacked fallback for focus mode.
    >
      <div className="col-span-full flex flex-none gap-0.5 border-b border-border">
        {tabs.map((x) => (
          <button
            key={x.id}
            onClick={() => onTab(x.id)}
            className={`-mb-px border-b-2 px-2.5 py-2 text-xs font-semibold ${
              tab === x.id ? "border-accent text-ink" : "border-transparent text-ink2"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3.5 min-[1040px]:min-h-0">
        <div className="rounded-xl border border-border bg-bg p-3.5 min-[1040px]:flex-[0_0_58%] min-[1040px]:min-h-0 min-[1040px]:overflow-y-auto">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Segmented value={range} onChange={onRange} options={[
              { value: "day", label: t.rangeDay }, { value: "week", label: t.rangeWeek }, { value: "month", label: t.rangeMonth },
            ]} />
            {dayAnchor && (
              <button onClick={() => onDayAnchor(null)} className="text-[11px] font-semibold text-accent">
                {t.dayPickerToday}
              </button>
            )}
          </div>
          <DayPicker rows={rows} anchor={anchorMs} dayAnchor={dayAnchor} onDayAnchor={(d) => { onDayAnchor(d); onRange("day"); }} t={t} lang={lang} />
        </div>
        <div className="min-h-[200px] rounded-xl border border-border bg-bg p-2 min-[1040px]:flex-[0_0_42%] min-[1040px]:min-h-0">
          <MapPanel
            geo={geo} nodes={nodes} isLive={isLive} selectedId={selectedId} filters={filters} counts={counts} t={t}
            onToggleFilter={onToggleFilter} onSelect={onSelect} layoutFor={layoutFor}
            onViewFullSensor={(id) => onPanelSensor(id)}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-bg p-4 min-[1040px]:min-h-0 min-[1040px]:overflow-y-auto">
        {tab === "cav" ? (
          !cav.loaded ? (
            <div className="text-xs text-ink2">{t.loading}…</div>
          ) : cav.failed && !cav.items.length ? (
            <div className="text-xs text-ink2">{t.cavLoadFailed}</div>
          ) : (
            <CavitationGrid
              items={cav.visible} summary={cav.summary} filter={cav.filter} onFilter={cav.setFilter}
              hasMore={cav.hasMore} onOlder={cav.older} scopedToRange={!!dayAnchor}
              selectedId={cav.selectedId} onSelect={cav.setSelectedId} onOpen={() => setDialogOpen(true)}
              t={t} locale={locale}
            />
          )
        ) : (
          <>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink2">
              <span className="h-0.5 w-3 rounded-[1px] bg-accent" /> {t[envVar]} · {sourceLabel}
            </div>
            {pairs.length < 2 ? (
              <div className="p-[30px] text-center text-[13px] text-ink2">
                {range === "day" ? `${t.waitingForData}…` : t.needsMoreDays}
              </div>
            ) : (
              <LineChart data={pairs.map((p) => p.v)} labels={labels} fmt={meta.fmt} h={420} />
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-3.5 min-[1040px]:min-h-0 min-[1040px]:overflow-y-auto">
        {tab === "cav" ? (
          <CavitationDetails
            c={cav.selected} y={cav.selected ? cav.traces[cav.selected.id] : undefined} t={t} locale={locale}
            canFlag={canEditIrrigation} onFlag={cav.saveFlag} onOpen={() => setDialogOpen(true)}
          />
        ) : (
          <>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 className="m-0 font-[family-name:var(--font-display)] text-base font-semibold">{node.label}</h3>
                <StatusPill status={node.status} t={t} />
              </div>
              <div className="text-[12.5px] text-ink2">
                {node.variety}
                {node.area !== null ? ` · ${node.area.toFixed(2)} ha` : ""} · {node.sensorCount}{" "}
                {node.sensorCount > 1 ? t.sensorsDeployedP : t.sensorsDeployed}
              </div>
              {node.mmDelta > 0 && (
                <div className="mt-1.5 font-mono text-xs font-semibold">
                  <span className="mr-[5px] inline-block align-[-1px]" style={{ color: STATUS_COLOR[node.status] }}>
                    <StatusIcon status={node.status} size={8} />
                  </span>
                  +{node.mmDelta} mm {t.recommendedMore}
                </div>
              )}
              {lastUpdated && <div className="mt-1.5 text-[11.5px] text-ink2">{t.updatedAgo} {lastUpdated}</div>}
            </div>

            {sensors.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="flex-none text-[10.5px] uppercase tracking-[0.04em] text-ink2">{t.sensorSource}</label>
                <select
                  value={panelSensor ?? ""}
                  onChange={(e) => onPanelSensor(e.target.value || null)}
                  className="flex-1 rounded-lg border-[1.5px] border-border bg-surface px-[9px] py-1.5 text-xs font-semibold text-ink"
                >
                  <option value="">{t.cuartelAggregate}</option>
                  {sensors.map((s) => (
                    <option key={s.id} value={s.id}>{s.label} ({String.fromCharCode(65 + s.circuitIdx)})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {ENV_KEYS.map((v) => {
                const unavailable = v.never || (v.liveOff && isLive);
                const last = unavailable ? null : lastNonNull(env[v.key]);
                const base = "rounded-[10px] border-[1.5px] px-[11px] py-[9px] text-left";
                if (unavailable || last === null) {
                  return (
                    <button key={v.key} disabled className={`${base} cursor-not-allowed border-border bg-surface opacity-50`}>
                      <div className="mb-[3px] text-[9.5px] uppercase tracking-[0.03em] text-ink2">{t[v.key]}</div>
                      <div className="text-[11px] font-medium italic text-ink2">
                        {unavailable ? t.noSensor : loading ? `${t.loading}…` : t.waitingForData}
                      </div>
                    </button>
                  );
                }
                return (
                  <button
                    key={v.key}
                    onClick={() => onEnvVar(v.key)}
                    className={`${base} bg-surface ${v.key === envVar ? "border-accent bg-accent-soft" : "border-border hover:border-accent/50"}`}
                  >
                    <div className="mb-[3px] text-[9.5px] uppercase tracking-[0.03em] text-ink2">{t[v.key]}</div>
                    <div className="font-mono text-sm font-semibold">{v.fmt(last)}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {dialogOpen && cav.selected && (
        <CavitationDialog
          supabase={cav.supabase} list={cav.visible} index={Math.max(0, cav.visible.findIndex((x) => x.id === cav.selected!.id))}
          t={t} lang={lang} canFlag={canEditIrrigation}
          onNavigate={cav.setSelectedId} onClose={() => setDialogOpen(false)} onFlag={cav.saveFlag}
        />
      )}
    </div>
  );
}
