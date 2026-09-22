"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { IrrigationConfig, Org, Plant, PlantIngestStatus, Reading } from "@/lib/types";
import { statusFor } from "@/lib/status";
import { STR, type Lang } from "@/lib/dashboard/i18n";
import { gridGeo, type Geo } from "@/lib/dashboard/geo";
import { DEMO_GEO } from "@/lib/dashboard/demo-geo";
import { buildEnv, type EnvKey, type Range } from "@/lib/dashboard/env";
import { buildSensorLayout, liveSensor, simNode, type SensorDot } from "@/lib/dashboard/sim";
import type { DNode, Severity } from "@/lib/dashboard/types";
import ThemeToggle from "@/components/theme-toggle";
import Wordmark from "@/components/wordmark";
import MapView from "./map-view";
import MetricsPanel, { type PanelTab } from "./metrics-panel";
import FocusShell from "./focus-shell";
import type { IrrigationPayload } from "./irrigation-block";
import { relTime, statusLabel } from "./ui";

const trailingNum = (s: string) => {
  const m = s.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
};
const byNatural = (a: Plant, b: Plant) => {
  const x = trailingNum(a.name), y = trailingNum(b.name);
  return x !== null && y !== null && x !== y ? x - y : a.name.localeCompare(b.name);
};

type Layout = { dots: SensorDot[]; circuits: import("@/lib/dashboard/geo").Circuit[] };

// Pure memoization: layouts are deterministic from (plant, sensors, status).
const layoutCache = new Map<string, Layout>();

export default function FarmDashboard({
  orgs, initialOrgId, userEmail, logoutAction,
}: {
  orgs: Org[];
  initialOrgId: string;
  userEmail?: string;
  logoutAction?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [lang, setLang] = useState<Lang>("en");
  const t = STR[lang];

  const [orgId, setOrgId] = useState(initialOrgId);
  const org = orgs.find((o) => o.id === orgId) ?? orgs[0];
  const isDemo = org.is_demo;
  const isLive = !isDemo;

  const [plants, setPlants] = useState<Plant[]>([]);
  const [ingest, setIngest] = useState<Record<string, PlantIngestStatus>>({});
  const [plantsLoaded, setPlantsLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<Reading[]>([]);
  const [rowsLoaded, setRowsLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [irrigation, setIrrigation] = useState<IrrigationConfig | null>(null);

  const [range, setRange] = useState<Range>("day");
  const [envVar, setEnvVar] = useState<EnvKey>("moisture");
  const [tab, setTab] = useState<PanelTab>("env");
  const [dayAnchor, setDayAnchor] = useState<Date | null>(null);
  const [panelSensor, setPanelSensor] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<Severity, boolean>>({ critical: true, warning: true, good: true });
  const [extraSensors, setExtraSensors] = useState<Record<string, number>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<string | null>(null);

  useEffect(() => {
    try {
      const l = localStorage.getItem("auselia-lang");
      if (l === "es" || l === "en") setLang(l);
    } catch {}
  }, []);
  const changeLang = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem("auselia-lang", l); } catch {}
  };

  // plants + per-plant status for the selected org
  const loadOrg = useCallback(async (id: string) => {
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from("plants").select("id, org_id, name, variety").eq("org_id", id),
      supabase.from("plant_ingest_status").select("*").eq("org_id", id),
    ]);
    const list = ((p ?? []) as Plant[]).sort(byNatural);
    const map: Record<string, PlantIngestStatus> = {};
    for (const r of (s ?? []) as PlantIngestStatus[]) map[r.plant_id] = r;
    setPlants(list);
    setIngest(map);
    setPlantsLoaded(true);
    return { list, map };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setPlantsLoaded(false); setPlants([]); setIngest({}); setRows([]); setRowsLoaded(false);
    setSelectedId(null); setPanelSensor(null); setEnvVar("moisture"); setTab(isDemo ? "ae" : "env"); setDayAnchor(null);
    loadOrg(orgId).then(({ list, map }) => {
      if (cancelled || !list.length) return;
      // demo opens on the most stressed plot, like the original dashboard
      const stress = (pl: Plant) => 100 - (map[pl.id]?.latest_soil_pct ?? 100);
      setSelectedId(isDemo ? [...list].sort((a, b) => stress(b) - stress(a))[0].id : list[0].id);
    });
    if (isLive) {
      const iv = setInterval(() => loadOrg(orgId), 5 * 60 * 1000);
      return () => { cancelled = true; clearInterval(iv); };
    }
    return () => { cancelled = true; };
  }, [orgId, isDemo, isLive, loadOrg]);

  const loadRows = useCallback(async (plantId: string) => {
    const { data } = await supabase
      .from("readings").select("*").eq("plant_id", plantId)
      .order("ts", { ascending: false }).limit(3000);
    setRows(((data ?? []) as Reading[]).reverse());
    setNow(Date.now());
    setRowsLoaded(true);
  }, [supabase]);

  useEffect(() => {
    if (!selectedId) return;
    setRowsLoaded(false);
    loadRows(selectedId);
    if (isLive) {
      supabase.from("irrigation_config").select("*").eq("plant_id", selectedId).maybeSingle()
        .then(({ data }) => setIrrigation((data as IrrigationConfig | null) ?? null));
      const iv = setInterval(() => loadRows(selectedId), 5 * 60 * 1000);
      return () => clearInterval(iv);
    }
  }, [selectedId, isLive, loadRows, supabase]);

  const geo: Geo = useMemo(() => (isDemo ? DEMO_GEO : gridGeo(plants.length)), [isDemo, plants.length]);

  const nodes: DNode[] = useMemo(() => {
    const out: DNode[] = [];
    plants.forEach((p, i) => {
      const ing = ingest[p.id];
      const status = isLive && ing?.is_stale ? "idle" : statusFor(ing?.latest_soil_pct);
      const cu = isDemo
        ? geo.cuarteles.find((c) => c.id === trailingNum(p.name))
        : geo.cuarteles[i];
      if (!cu) return;
      const label = isDemo ? p.name : p.variety ? `${p.name} · ${p.variety}` : p.name;
      const sim = isDemo ? simNode(p.id, status) : null;
      out.push({
        id: p.id, label, variety: p.variety, area: cu.area_ha, path: cu.path, status, isLive,
        stress: sim?.stress ?? 0,
        sensorCount: (sim?.sensorCount ?? 1) + (extraSensors[p.id] ?? 0),
        mmPlan: sim?.mmPlan ?? null, mmDelta: sim?.mmDelta ?? 0, ae: sim?.ae ?? [],
      });
    });
    return out;
  }, [plants, ingest, geo, isDemo, isLive, extraSensors]);

  const node = nodes.find((n) => n.id === selectedId) ?? null;

  const layoutFor = useCallback((n: DNode): Layout => {
    const key = `${n.id}:${n.sensorCount}:${n.status}`;
    const hit = layoutCache.get(key);
    if (hit) return hit;
    const l: Layout = n.isLive
      ? { dots: [liveSensor(n.label, n.path, n.status)], circuits: [] }
      : buildSensorLayout(n.id, n.path, n.status, n.sensorCount);
    layoutCache.set(key, l);
    return l;
  }, []);

  const sensors = node ? layoutFor(node).dots : [];
  const dot = panelSensor ? sensors.find((s) => s.id === panelSensor) : undefined;

  const anchor = dayAnchor ? dayAnchor.getTime() : isDemo && rows.length ? new Date(rows[rows.length - 1].ts).getTime() : now;
  const { dates, env } = useMemo(
    () => buildEnv(rows, range, anchor, dot?.jitter ?? 1),
    [rows, range, anchor, dot?.jitter],
  );

  const counts = { critical: 0, warning: 0, good: 0 } as Record<Severity, number>;
  nodes.forEach((n) => { if (n.status in counts) counts[n.status as Severity]++; });

  const selectNode = (id: string) => {
    // Re-selecting the plant already open (e.g. clicking it again on the compact map just
    // to zoom in) changes nothing here; only MapView's own local zoom needs to happen. A
    // real switch resets the per-plant state, but keeps whatever tab you were on: the tab
    // set is the same for every plant in one org, so there is nothing to reset it for.
    if (id === selectedId) return;
    setSelectedId(id); setEnvVar("moisture"); setPanelSensor(null); setDayAnchor(null);
  };

  async function saveIrrigation(p: IrrigationPayload) {
    if (!selectedId) return false;
    const { data, error } = await supabase
      .from("irrigation_config")
      .upsert({ plant_id: selectedId, ...p, updated_at: new Date().toISOString() })
      .select().single();
    if (error) return false;
    setIrrigation(data as IrrigationConfig);
    return true;
  }

  const lastUpdated = rows.length ? relTime(new Date(rows[rows.length - 1].ts), t) : null;

  let summary = "";
  if (isLive) {
    const last = rows.length ? new Date(rows[rows.length - 1].ts) : null;
    summary = [
      t.livePot,
      rowsLoaded ? `${rows.length} ${t.readings}` : `${t.waitingForData}…`,
      rowsLoaded && last ? `${t.updatedAgo} ${relTime(last, t)}` : null,
    ].filter(Boolean).join(" · ");
  } else if (nodes.length) {
    const baseline = Math.round(nodes.reduce((s, n) => s + (n.mmPlan ?? 0), 0) / nodes.length);
    summary = [
      `${nodes.length} ${t.cuartelesMonitored}`,
      geo.farmArea !== null ? `${geo.farmArea} ha` : null,
      `${counts.good} ${statusLabel("good", t).toLowerCase()}`,
      `${counts.warning} ${statusLabel("warning", t).toLowerCase()}`,
      `${counts.critical} ${statusLabel("critical", t).toLowerCase()}`,
      `${baseline} ${t.baselinePlan}`,
    ].filter(Boolean).join(" · ");
  }

  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-[1700px] flex-col px-7 pb-[60px] min-[901px]:h-screen min-[901px]:overflow-hidden min-[901px]:pb-3.5"
      onClick={() => setMenuOpen(false)}
    >
      <div className="flex flex-none flex-wrap items-center justify-between gap-2.5 pt-[22px]">
        <div className="flex items-center gap-[9px] font-[family-name:var(--font-display)] text-[15px] font-bold tracking-[0.01em]">
          <Link href="/" className="flex items-center">
            <Wordmark size={26} />
          </Link>
          <span className="font-normal text-ink2">·</span>
          <span>{org.name}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {orgs.length > 1 && (
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2.5 py-[7px] text-xs font-semibold text-ink"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}{o.is_demo ? ` (${t.demoTag})` : ""}</option>
              ))}
            </select>
          )}
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
            {(["es", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => changeLang(l)}
                className={`rounded-md px-2.5 py-[5px] font-mono text-[11px] font-semibold tracking-[0.03em] ${
                  lang === l ? "bg-accent text-accent-ink" : "text-ink2"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <ThemeToggle />
          {userEmail && <span className="hidden text-xs text-ink2 sm:inline">{userEmail}</span>}
          {logoutAction && (
            <form action={logoutAction}>
              <button className="text-xs text-ink2 underline">{t.signOut}</button>
            </form>
          )}
          {!userEmail && (
            <Link href="/login" className="rounded-full border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-ink2">
              {t.partnerSignIn}
            </Link>
          )}
          {isDemo && (
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="h-8 w-8 rounded-lg border border-border bg-surface font-mono text-base font-bold leading-none text-ink2 hover:text-ink"
              >
                &#8942;
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-[38px] z-20 min-w-[170px] rounded-[10px] border border-border bg-surface p-[5px] shadow-xl">
                  <button
                    onClick={() => { setMenuOpen(false); if (node) setModal(node.id); }}
                    className="block w-full rounded-[7px] px-2.5 py-2 text-left text-[13px] font-medium text-ink hover:bg-surface-2"
                  >
                    {t.addNode}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-col min-[901px]:min-h-0 min-[901px]:flex-1">
        <div className="mb-2.5 flex-none text-[13px] text-ink2">{summary || `${t.loading}…`}</div>

        {plantsLoaded && !nodes.length ? (
          <p className="py-16 text-center text-sm text-ink2">{t.noPlants}</p>
        ) : (tab === "env" || tab === "cav") && node ? (
          <FocusShell
            node={node} t={t} lang={lang} isLive={isLive} tab={tab} onTab={setTab}
            canEditIrrigation={isLive && !!userEmail}
            sensors={sensors} panelSensor={panelSensor} onPanelSensor={setPanelSensor}
            dates={dates} env={env} envVar={envVar} onEnvVar={setEnvVar}
            range={range} onRange={setRange} loading={!rowsLoaded}
            rows={rows} anchorMs={anchor} dayAnchor={dayAnchor} onDayAnchor={setDayAnchor} lastUpdated={lastUpdated}
            geo={geo} nodes={nodes} selectedId={selectedId} filters={filters} counts={counts}
            onToggleFilter={(s) => setFilters((f) => ({ ...f, [s]: !f[s] }))}
            onSelect={selectNode} layoutFor={layoutFor}
          />
        ) : (
          <div className="grid grid-cols-1 gap-[22px] min-[901px]:min-h-0 min-[901px]:flex-1 min-[901px]:grid-cols-[minmax(0,1.7fr)_minmax(280px,420px)] min-[901px]:grid-rows-[minmax(0,1fr)]">
            <MapView
              geo={geo} nodes={nodes} isLive={isLive} selectedId={selectedId} filters={filters} counts={counts} t={t}
              onToggleFilter={(s) => setFilters((f) => ({ ...f, [s]: !f[s] }))}
              onSelect={selectNode}
              layoutFor={layoutFor}
              onViewFullSensor={(id) => { setPanelSensor(id); }}
            />
            {node && (
              <MetricsPanel
                node={node} t={t} lang={lang} isLive={isLive}
                sensors={sensors} panelSensor={panelSensor} onPanelSensor={setPanelSensor}
                tab={tab} onTab={setTab}
                dates={dates} env={env} envVar={envVar} onEnvVar={setEnvVar}
                range={range} onRange={setRange} loading={!rowsLoaded}
                irrigation={irrigation} onSaveIrrigation={saveIrrigation}
                canEditIrrigation={isLive && !!userEmail}
              />
            )}
          </div>
        )}
      </div>

      {!isLive && (
        <div className="mt-2.5 flex-none border-t border-border pt-4 text-[11.5px] text-ink2 min-[901px]:mt-2.5">
          {t.footNoteDemo}
        </div>
      )}

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5"
          onClick={() => setModal(null)}
        >
          <AddSensorModal
            t={t} nodes={nodes} initial={modal}
            onCancel={() => setModal(null)}
            onSave={(id) => {
              setExtraSensors((e) => ({ ...e, [id]: (e[id] ?? 0) + 1 }));
              setModal(null);
              selectNode(id);
            }}
          />
        </div>
      )}
    </div>
  );
}

function AddSensorModal({
  t, nodes, initial, onCancel, onSave,
}: {
  t: (typeof STR)["en"]; nodes: DNode[]; initial: string; onCancel: () => void; onSave: (id: string) => void;
}) {
  const [id, setId] = useState(initial);
  return (
    <div
      className="w-full max-w-[380px] rounded-2xl border border-border bg-surface p-[26px]"
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="mb-4 mt-0 font-[family-name:var(--font-display)] text-[17px] font-semibold">{t.modalTitle}</h3>
      <label className="mb-[5px] block text-[11.5px] uppercase tracking-[0.03em] text-ink2">{t.lblCuartel}</label>
      <select
        value={id}
        onChange={(e) => setId(e.target.value)}
        className="w-full rounded-lg border border-border bg-bg px-2.5 py-2 text-ink"
      >
        {nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label}{n.area !== null ? ` (${n.area.toFixed(2)} ha)` : ""}
          </option>
        ))}
      </select>
      <div className="mt-[18px] flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-ink">
          {t.cancel}
        </button>
        <button onClick={() => onSave(id)} className="rounded-lg bg-amber px-4 py-2 text-[13px] font-semibold text-forest">
          {t.save}
        </button>
      </div>
    </div>
  );
}
