"use client";

import { useEffect, useState } from "react";
import type { IrrigationConfig, Reading, Role } from "@/lib/types";
import type { Lang, Strings } from "@/lib/dashboard/i18n";
import type { EnvKey, EnvSeries, Range } from "@/lib/dashboard/env";
import type { SensorDot } from "@/lib/dashboard/sim";
import type { Geo } from "@/lib/dashboard/geo";
import type { DNode, PanelTab, Severity } from "@/lib/dashboard/types";
import { useCavitationData } from "@/lib/dashboard/use-cavitation-data";
import { demoStorageGet, demoStorageSet } from "@/lib/dashboard/demo-storage";
import { STATUS_COLOR } from "@/lib/status";
import StatusIcon from "@/components/status-icon";
import { StatusPill, Segmented } from "./ui";
import { ENV_KEYS, lastNonNull } from "@/lib/dashboard/env";
import LineChart from "./line-chart";
import DayPicker from "./day-picker";
import GeneralTab from "./general-tab";
import CavitationGrid from "./cavitation-grid";
import CavitationDetails from "./cavitation-details";
import CavitationDialog from "./cavitation-dialog";
import IrrigationBlock, { type IrrigationPayload } from "./irrigation-block";
import SettingsNav, { type SettingsSection } from "./settings-nav";
import SettingsPlant from "./settings-plant";
import SettingsStress from "./settings-stress";
import type { Layout } from "./map-view";

// The one shell every tab renders inside. General is the farm-wide landing view (map + a
// status-sorted plant list, no picker, no details column). Every other tab is a focused,
// single-plant view with no map of its own - just a "back to General" link and a plant
// switcher (below the tab bar) instead. Desktop only (min-[1040px]); below that it falls
// back to a plain stacked column.
export default function TabShell({
  node, t, lang, isLive, tab, onTab, canEdit, role,
  sensors, panelSensor, onPanelSensor,
  dates, env, envVar, onEnvVar, range, onRange, loading,
  rows, anchorMs, dayAnchor, onDayAnchor, lastUpdated,
  geo, nodes, selectedId, filters, counts, onToggleFilter, onSelect, layoutFor,
  orgName, irrigation, onSaveIrrigation, summary,
}: {
  node: DNode; t: Strings; lang: Lang; isLive: boolean;
  tab: PanelTab; onTab: (t: PanelTab) => void; canEdit: boolean; role: Role | null;
  sensors: SensorDot[]; panelSensor: string | null; onPanelSensor: (id: string | null) => void;
  dates: Date[]; env: EnvSeries; envVar: EnvKey; onEnvVar: (k: EnvKey) => void;
  range: Range; onRange: (r: Range) => void; loading: boolean;
  rows: Reading[]; anchorMs: number; dayAnchor: Date | null; onDayAnchor: (d: Date | null) => void;
  lastUpdated: string | null;
  geo: Geo; nodes: DNode[]; selectedId: string | null;
  filters: Record<Severity, boolean>; counts: Record<Severity, number>;
  onToggleFilter: (s: Severity) => void; onSelect: (id: string) => void;
  layoutFor: (n: DNode) => Layout;
  orgName: string; irrigation: IrrigationConfig | null;
  onSaveIrrigation: (p: IrrigationPayload) => Promise<boolean>;
  summary: string;
}) {
  const locale = lang === "es" ? "es-CL" : undefined;
  const cav = useCavitationData(node.id, dayAnchor, range);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection>("plant");

  // Off by default for everyone. Live persists the choice in localStorage, same as theme/lang.
  // The demo persists it too, but only for the session (sessionStorage) - it should reset
  // once the visitor leaves, not linger like a real account's preference would.
  //
  // Read lazily (inside useState's initializer, not an effect) so a TabShell that remounts -
  // which happens on every org switch, since farm-dashboard.tsx briefly nulls `node` while it
  // loads the new org's plants - picks up the stored value on its very first render instead of
  // flashing "off" for a frame while an effect catches up. The effect below stays as a second
  // path for the (rarer) case where isLive itself changes without a remount.
  const readAdvanced = () => {
    if (isLive) {
      try { return localStorage.getItem("auselia-cav-advanced") === "1"; } catch { return false; }
    }
    return demoStorageGet<boolean>("advanced") ?? false;
  };
  const [advanced, setAdvanced] = useState(readAdvanced);
  useEffect(() => {
    setAdvanced(readAdvanced());
  }, [isLive]);
  const setAdvancedPersist = (v: boolean) => {
    setAdvanced(v);
    if (isLive) {
      try { localStorage.setItem("auselia-cav-advanced", v ? "1" : "0"); } catch {}
    } else {
      demoStorageSet("advanced", v);
    }
  };

  const isGeneral = tab === "general";
  const isSettings = tab === "settings";
  const hasPicker = tab === "env" || tab === "stress";

  const tabs: { id: PanelTab; label: string }[] = [
    { id: "general", label: t.tabGeneral },
    { id: "env", label: t.tabEnv },
    { id: "stress", label: t.tabStress },
    { id: "settings", label: t.tabSettings },
  ];

  const settingsSections: { id: SettingsSection; label: string }[] = [
    { id: "plant", label: t.settingsPlant },
    { id: "irrigation", label: t.settingsIrrigation },
    { id: "stress", label: t.settingsStress },
  ];

  // Picking a plant from General commits straight into the focused view - no "zoom and
  // linger" step, matching how map-panel.tsx's own enlarge popover already treats a cuartel
  // click as "pick it and leave," not an intermediate state.
  const enterPlant = (id: string) => { onSelect(id); onTab("env"); };
  const enterSensor = (dotId: string) => { onPanelSensor(dotId); onTab("env"); };

  // A signed-in Viewer being told "sign in to flag" would be wrong - that message is only
  // for the demo/unauthenticated case. A real Viewer gets a distinct, accurate one.
  const noFlagMessage = role === "viewer" ? t.cavViewOnly : t.cavSignIn;

  const dot = panelSensor ? sensors.find((s) => s.id === panelSensor) : undefined;
  const sourceLabel = dot ? `${node.label} · ${dot.label}` : node.label;

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
      className={`grid grid-cols-1 gap-[18px] min-[901px]:min-h-0 min-[901px]:flex-1 min-[901px]:overflow-y-auto
      min-[1040px]:grid-rows-[auto_minmax(0,1fr)] ${
        isGeneral
          ? "min-[1040px]:grid-cols-1"
          : isSettings
          ? "min-[1040px]:grid-cols-[minmax(210px,23%)_minmax(0,1fr)]"
          : "min-[1040px]:grid-cols-[minmax(210px,23%)_minmax(0,1fr)_minmax(230px,24%)]"
      }`}
      // TODO: tighten the 901-1039px and mobile stacked fallback for this shell.
    >
      <div className="col-span-full flex flex-col gap-2">
        <div className="flex flex-none gap-0.5 border-b border-border">
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
        {!isGeneral && (
          <div className="flex flex-none flex-wrap items-center gap-2">
            <button onClick={() => onTab("general")} className="text-xs font-semibold text-accent">
              &larr; {t.backToGeneral}
            </button>
            <span className="relative inline-flex items-center">
              <select
                aria-label={t.switchPlantAria}
                value={selectedId ?? ""}
                onChange={(e) => onSelect(e.target.value)}
                className="appearance-none rounded-lg border border-border bg-surface px-2 py-1 pr-6 text-xs font-semibold text-ink"
              >
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </select>
              <svg
                width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                className="pointer-events-none absolute right-2 text-ink2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </div>
        )}
      </div>

      {!isGeneral && (
        <div className="flex flex-col gap-3.5 min-[1040px]:min-h-0">
          {hasPicker && (
            <div className="flex-1 rounded-xl border border-border bg-bg p-3.5 min-[1040px]:min-h-0 min-[1040px]:overflow-y-auto">
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
          )}
          {isSettings && (
            <div className="flex-1 rounded-xl border border-border bg-bg p-3.5 min-[1040px]:min-h-0 min-[1040px]:overflow-y-auto">
              <SettingsNav sections={settingsSections} active={section} onSelect={setSection} />
            </div>
          )}
        </div>
      )}

      <div className={isGeneral ? "min-[1040px]:min-h-0" : "rounded-xl border border-border bg-bg p-4 min-[1040px]:min-h-0 min-[1040px]:overflow-y-auto"}>
        {isGeneral ? (
          <GeneralTab
            summary={summary} geo={geo} nodes={nodes} isLive={isLive} selectedId={selectedId} filters={filters} counts={counts} t={t}
            onToggleFilter={onToggleFilter} onSelect={enterPlant} layoutFor={layoutFor} onViewFullSensor={enterSensor}
          />
        ) : tab === "stress" ? (
          !cav.loaded ? (
            <div className="text-xs text-ink2">{t.loading}…</div>
          ) : cav.failed && !cav.items.length ? (
            <div className="text-xs text-ink2">{t.cavLoadFailed}</div>
          ) : (
            <CavitationGrid
              items={cav.visible} summary={cav.summary} filter={cav.filter} onFilter={cav.setFilter}
              hasMore={cav.hasMore} onOlder={cav.older} scopedToRange={!!dayAnchor}
              selectedId={cav.selectedId} onSelect={cav.setSelectedId} onOpen={() => setDialogOpen(true)}
              t={t} locale={locale} advanced={advanced}
            />
          )
        ) : isSettings ? (
          section === "irrigation" ? (
            <IrrigationBlock config={irrigation} t={t} onSave={onSaveIrrigation} canEdit={canEdit} />
          ) : section === "stress" ? (
            <SettingsStress
              summary={cav.summary} loaded={cav.loaded} t={t}
              advanced={advanced} onAdvanced={setAdvancedPersist}
              plantId={node.id} isLive={isLive} canEdit={canEdit}
            />
          ) : (
            <SettingsPlant node={node} orgName={orgName} t={t} />
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

      {!isSettings && !isGeneral && (
        <div className="flex flex-col gap-3.5 min-[1040px]:min-h-0 min-[1040px]:overflow-y-auto">
          {tab === "stress" ? (
            <CavitationDetails
              c={cav.selected} y={cav.selected ? cav.traces[cav.selected.id] : undefined} t={t} locale={locale}
              canFlag={canEdit} noFlagMessage={noFlagMessage} onFlag={cav.saveFlag} onOpen={() => setDialogOpen(true)} advanced={advanced}
            />
          ) : (
            <>
              <CuartelHeader node={node} lastUpdated={lastUpdated} t={t} />

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
      )}

      {dialogOpen && cav.selected && advanced && (
        <CavitationDialog
          supabase={cav.supabase} list={cav.visible} index={Math.max(0, cav.visible.findIndex((x) => x.id === cav.selected!.id))}
          t={t} lang={lang} canFlag={canEdit} noFlagMessage={noFlagMessage}
          onNavigate={cav.setSelectedId} onClose={() => setDialogOpen(false)} onFlag={cav.saveFlag}
        />
      )}
    </div>
  );
}

function CuartelHeader({ node, lastUpdated, t }: { node: DNode; lastUpdated: string | null; t: Strings }) {
  return (
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
  );
}
