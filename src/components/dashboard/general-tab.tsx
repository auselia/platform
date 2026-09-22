"use client";

import type { Strings } from "@/lib/dashboard/i18n";
import type { Geo } from "@/lib/dashboard/geo";
import type { DNode, Severity } from "@/lib/dashboard/types";
import MapView, { type Layout } from "./map-view";
import { StatusPill } from "./ui";

const RANK: Record<DNode["status"], number> = { critical: 0, warning: 1, good: 2, idle: 3 };

// The farm-wide landing tab: the full interactive map, plus a status-sorted list (critical
// first) so "is anything wrong" is answerable without hunting the map visually. Either one
// commits into a focused, single-plant view - there is no "zoom and linger" step here, see
// tab-shell.tsx's enterPlant/enterSensor.
export default function GeneralTab({
  summary, geo, nodes, isLive, selectedId, filters, counts, t,
  onToggleFilter, onSelect, layoutFor, onViewFullSensor,
}: {
  summary: string;
  geo: Geo; nodes: DNode[]; isLive: boolean; selectedId: string | null;
  filters: Record<Severity, boolean>; counts: Record<Severity, number>; t: Strings;
  onToggleFilter: (s: Severity) => void; onSelect: (id: string) => void;
  layoutFor: (n: DNode) => Layout;
  onViewFullSensor: (dotId: string) => void;
}) {
  const sorted = [...nodes].sort(
    (a, b) => RANK[a.status] - RANK[b.status] || a.label.localeCompare(b.label),
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex-none text-[13px] text-ink2">{summary || `${t.loading}…`}</div>
      <div className="grid flex-1 grid-cols-1 gap-3.5 min-[1040px]:min-h-0 min-[1040px]:grid-cols-[minmax(0,1fr)_minmax(230px,28%)]">
        <div className="min-h-[320px] rounded-xl border border-border bg-bg p-2 min-[1040px]:min-h-0">
          <MapView
            geo={geo} nodes={nodes} isLive={isLive} selectedId={selectedId} filters={filters} counts={counts} t={t}
            onToggleFilter={onToggleFilter} onSelect={onSelect} layoutFor={layoutFor} onViewFullSensor={onViewFullSensor}
          />
        </div>
        <div className="flex flex-col gap-1.5 overflow-y-auto rounded-xl border border-border bg-bg p-2 min-[1040px]:min-h-0">
          {sorted.map((n) => (
            <button
              key={n.id}
              onClick={() => onSelect(n.id)}
              aria-current={n.id === selectedId}
              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left ${
                n.id === selectedId ? "border-accent bg-surface-2" : "border-border hover:bg-surface-2"
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">{n.label}</div>
                <div className="text-[11px] text-ink2">{n.area !== null ? `${n.area.toFixed(2)} ha` : ""}</div>
              </div>
              <StatusPill status={n.status} t={t} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
