"use client";

import type { IrrigationConfig } from "@/lib/types";
import type { Lang, Strings } from "@/lib/dashboard/i18n";
import type { EnvKey, EnvSeries, Range } from "@/lib/dashboard/env";
import type { SensorDot } from "@/lib/dashboard/sim";
import type { DNode } from "@/lib/dashboard/types";
import StatusIcon from "@/components/status-icon";
import { STATUS_COLOR } from "@/lib/status";
import { StatusPill } from "./ui";
import IrrigationBlock, { type IrrigationPayload } from "./irrigation-block";
import EnvTab from "./env-tab";
import AeTab from "./ae-tab";
import EventsTab from "./events-tab";
import CavitationTab from "./cavitation-tab";

export type PanelTab = "ae" | "env" | "events" | "cav";

export default function MetricsPanel({
  node, t, lang, isLive, sensors, panelSensor, onPanelSensor, tab, onTab,
  dates, env, envVar, onEnvVar, range, onRange, loading,
  irrigation, onSaveIrrigation, canEditIrrigation,
}: {
  node: DNode; t: Strings; lang: Lang; isLive: boolean;
  sensors: SensorDot[]; panelSensor: string | null; onPanelSensor: (id: string | null) => void;
  tab: PanelTab; onTab: (t: PanelTab) => void;
  dates: Date[]; env: EnvSeries; envVar: EnvKey; onEnvVar: (k: EnvKey) => void;
  range: Range; onRange: (r: Range) => void; loading: boolean;
  irrigation: IrrigationConfig | null;
  onSaveIrrigation: (p: IrrigationPayload) => Promise<boolean>;
  canEditIrrigation: boolean;
}) {
  const dot = panelSensor ? sensors.find((s) => s.id === panelSensor) : undefined;
  const sourceLabel = dot ? `${node.label} · ${dot.label}` : node.label;
  const ae = dot ? dot.ae : node.ae;
  const tabs: { id: PanelTab; label: string }[] = isLive
    ? [{ id: "env", label: t.tabEnv }, { id: "cav", label: t.tabCav }]
    : [{ id: "ae", label: t.tabAe }, { id: "env", label: t.tabEnv }, { id: "events", label: t.tabEvents }];

  return (
    <div className="flex flex-col rounded-xl border border-border bg-bg px-[18px] py-4 min-[901px]:h-full min-[901px]:min-h-0">
      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 font-[family-name:var(--font-display)] text-base font-semibold">{node.label}</h3>
          <StatusPill status={node.status} t={t} />
        </div>
        <div className="mb-3.5 text-[12.5px] text-ink2">
          {node.variety}
          {node.area !== null ? ` · ${node.area.toFixed(2)} ha` : ""} · {node.sensorCount}{" "}
          {node.sensorCount > 1 ? t.sensorsDeployedP : t.sensorsDeployed}
        </div>
        {node.mmDelta > 0 && (
          <div className="-mt-1.5 mb-3.5 font-mono text-xs font-semibold">
            <span className="mr-[5px] inline-block align-[-1px]" style={{ color: STATUS_COLOR[node.status] }}>
              <StatusIcon status={node.status} size={8} />
            </span>
            +{node.mmDelta} mm {t.recommendedMore}
          </div>
        )}
      </div>

      {isLive && canEditIrrigation && (
        <IrrigationBlock key={irrigation?.updated_at ?? "default"} config={irrigation} t={t} onSave={onSaveIrrigation} />
      )}

      {sensors.length > 1 && (
        <div className="mt-3.5 flex items-center gap-2">
          <label className="flex-none text-[10.5px] uppercase tracking-[0.04em] text-ink2">{t.sensorSource}</label>
          <select
            value={panelSensor ?? ""}
            onChange={(e) => onPanelSensor(e.target.value || null)}
            className="flex-1 rounded-lg border-[1.5px] border-border bg-surface px-[9px] py-1.5 text-xs font-semibold text-ink"
          >
            <option value="">{t.cuartelAggregate}</option>
            {sensors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({String.fromCharCode(65 + s.circuitIdx)})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="-mb-px mt-3 flex flex-none gap-0.5 border-b border-border">
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

      <div className="mt-3 flex flex-col gap-3.5 min-[901px]:min-h-0 min-[901px]:flex-1 min-[901px]:overflow-y-auto">
        {isLive && tab === "cav" ? (
          <CavitationTab key={node.id} plantId={node.id} t={t} lang={lang} canFlag={canEditIrrigation} />
        ) : isLive || tab === "env" ? (
          <EnvTab
            t={t} lang={lang} isLive={isLive} dates={dates} env={env} sourceLabel={sourceLabel}
            envVar={envVar} onEnvVar={onEnvVar} range={range} onRange={onRange} loading={loading}
          />
        ) : tab === "events" ? (
          <EventsTab
            key={sourceLabel} t={t} lang={lang} nodeLabel={node.label} ae={ae}
            sensorCount={node.sensorCount} fixedSensor={dot?.label}
          />
        ) : (
          <AeTab t={t} lang={lang} ae={ae} sourceLabel={sourceLabel} />
        )}
      </div>
    </div>
  );
}
