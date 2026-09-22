"use client";

import { useEffect, useState } from "react";
import type { Strings } from "@/lib/dashboard/i18n";
import type { Geo } from "@/lib/dashboard/geo";
import type { DNode, Severity } from "@/lib/dashboard/types";
import MapView, { type Layout } from "./map-view";

// A small, read-only locator map for the focus-mode left column, with a button to open a
// bigger, fully interactive map as a floating popover. Not the full-screen dialog pattern
// used elsewhere (CavitationDialog): this stays a popover over a dimmed backdrop, sized to
// roughly two thirds of the viewport, so the page underneath is still visible around it.
export default function MapPanel(props: {
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
  onViewFullSensor: (dotId: string) => void;
}) {
  const { t, onSelect, onViewFullSensor } = props;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <div className="relative h-full w-full">
      <MapView {...props} compact />
      <button
        onClick={() => setExpanded(true)}
        aria-label={t.mapEnlarge}
        title={t.mapEnlarge}
        className="absolute right-1.5 top-1.5 z-[4] rounded-md border border-border bg-surface p-1 text-ink2 shadow-md hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setExpanded(false); }}
        >
          <div className="relative h-[68vh] w-[68vw] max-w-[1100px] rounded-2xl border border-border bg-bg p-2 shadow-xl">
            <button
              onClick={() => setExpanded(false)}
              aria-label={t.dlgClose}
              className="absolute -right-2.5 -top-2.5 z-[7] flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-sm text-ink2 shadow-md hover:text-ink"
            >
              &times;
            </button>
            <MapView
              {...props}
              onSelect={(id) => { onSelect(id); setExpanded(false); }}
              onViewFullSensor={(id) => { onViewFullSensor(id); setExpanded(false); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
