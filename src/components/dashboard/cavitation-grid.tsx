"use client";

import { useEffect, useRef } from "react";
import type { Cavitation, CavitationSummary } from "@/lib/types";
import type { Strings } from "@/lib/dashboard/i18n";
import { CLASS_KEY } from "@/lib/dashboard/cavitation";
import { applyClick } from "@/lib/dashboard/capture-selection";
import type { CavitationFilter } from "@/lib/dashboard/use-cavitation-data";
import { FlagMark, Segmented, relTime } from "./ui";

// Center column of focus mode for the Cavitations tab: browse many captures at a glance.
// A click picks one to inspect in the right-column CavitationDetails; a double-click skips
// straight to the full analysis dialog for it, same shortcut people expect from a file grid.
export default function CavitationGrid({
  items, summary, filter, onFilter, hasMore, onOlder, scopedToRange,
  selectedId, onSelect, onOpen, onManage, selection, onSelection, onDeleteSelection, t, locale, advanced,
}: {
  items: Cavitation[]; summary: CavitationSummary | null;
  filter: CavitationFilter; onFilter: (f: CavitationFilter) => void;
  hasMore: boolean; onOlder: () => void;
  // true when a day/range is picked: "no captures" means none in that window, not ever.
  scopedToRange: boolean;
  selectedId: number | null; onSelect: (id: number) => void; onOpen: () => void;
  // Owners only (undefined for everyone else): opens the delete-captures dialog.
  onManage?: () => void;
  // Owners only (all three undefined for everyone else): Ctrl/Cmd-click toggles a card,
  // Shift-click selects a range, and a bar with a Delete button appears while any are selected.
  selection?: ReadonlySet<number>;
  onSelection?: (s: Set<number>) => void;
  onDeleteSelection?: () => void;
  t: Strings; locale: string | undefined;
  // Off by default: hides raw mV/kHz numbers on each card and disables the
  // double-click shortcut into the full-analysis dialog. See settings-oscilloscope.tsx.
  advanced: boolean;
}) {
  const multi = !!onSelection;
  const picked = selection ?? new Set<number>();
  const anchor = useRef<number | null>(null);

  useEffect(() => {
    if (!picked.size) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onSelection?.(new Set()); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked.size, onSelection]);

  function click(e: React.MouseEvent, id: number) {
    const r = applyClick(
      items.map((c) => c.id), picked, selectedId, anchor.current, id,
      { toggle: multi && (e.metaKey || e.ctrlKey), range: multi && e.shiftKey },
    );
    anchor.current = r.anchor;
    if (r.kind === "multi") { onSelection!(r.picked); return; }
    if (picked.size) onSelection?.(new Set());
    onSelect(id);
  }

  const tiles: [string, string][] = [
    [t.cavLast24h, String(summary?.last_24h ?? 0)],
    [t.cavLast7d, String(summary?.last_7d ?? 0)],
    [t.cavFlagged, String(summary?.flagged ?? 0)],
    [t.cavLastCapture, summary?.last_capture_at ? relTime(new Date(summary.last_capture_at), t) : "-"],
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={filter} onChange={onFilter}
          options={[{ value: "all", label: t.cavAll }, { value: "flagged", label: t.cavOnlyFlagged }]}
        />
        <div className="grid flex-1 grid-cols-4 gap-2">
          {tiles.map(([k, v]) => (
            <div key={k} className="rounded-[10px] border border-border px-2.5 py-1.5">
              <div className="text-[9px] uppercase tracking-[0.03em] text-ink2">{k}</div>
              <div className="mt-0.5 font-mono text-[13px] font-semibold">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {picked.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-accent bg-surface px-3 py-2 text-xs shadow">
          <span className="font-semibold">{t.delSelectedCount.replace("{n}", String(picked.size))}</span>
          <button onClick={() => onSelection?.(new Set(items.map((c) => c.id)))} className="font-semibold text-accent">
            {t.delSelectShown.replace("{n}", String(items.length))}
          </button>
          <button onClick={() => onSelection?.(new Set())} className="text-ink2 hover:text-ink">{t.delClear}</button>
          <button
            onClick={onDeleteSelection}
            className="ml-auto rounded-lg bg-status-critical px-3 py-1.5 font-semibold text-white"
          >
            {t.delBarDelete.replace("{n}", String(picked.size))}
          </button>
        </div>
      )}

      {!items.length ? (
        <div className="rounded-[10px] border border-dashed border-border px-3.5 py-10 text-center text-[12.5px] text-ink2">
          {filter === "flagged" ? t.cavNoneFlagged : scopedToRange ? t.cavNoneInRange : t.cavNone}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(172px,1fr))] gap-2.5">
          {items.map((c) => {
            const d = new Date(c.ts);
            return (
            <button
              key={c.id}
              onClick={(e) => click(e, c.id)}
              onDoubleClick={() => { onSelect(c.id); if (advanced) onOpen(); }}
              aria-current={c.id === selectedId}
              aria-pressed={multi ? picked.has(c.id) : undefined}
              className={`flex select-none flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left text-xs ${
                picked.has(c.id)
                  ? "border-accent bg-accent-soft ring-1 ring-accent"
                  : c.id === selectedId ? "border-accent bg-surface-2" : "border-border hover:bg-surface-2"
              }`}
            >
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {c.flagged ? <FlagMark title={t.cavFlagged} /> : <span className="inline-block w-3" />}
                <span className="whitespace-nowrap font-mono text-[11px]">{d.toLocaleDateString(locale, { month: "short", day: "numeric" })}</span>
                <span className="whitespace-nowrap font-mono text-[11px] text-ink2">{d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</span>
              </span>
              <span className="text-ink2">{t[CLASS_KEY[c.cls]]}</span>
              {advanced && (
                <span className="flex justify-between font-mono text-ink2">
                  <span>{c.peak_mv !== null ? `${c.peak_mv} mV` : "-"}</span>
                  <span>{c.freq_khz !== null ? `${c.freq_khz} kHz` : "-"}</span>
                </span>
              )}
            </button>
            );
          })}
        </div>
      )}
      {hasMore && filter === "all" && (
        <button onClick={onOlder} className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink2">
          {t.cavOlder}
        </button>
      )}
      <div className="text-[11px] text-ink2">{t.cavClsHint}</div>
      {multi && !picked.size && <div className="text-[11px] text-ink2">{t.delSelectHint}</div>}
      {onManage && (
        <div className="mt-6 border-t border-border pt-2">
          <button onClick={onManage} className="text-[11px] text-ink2 underline decoration-dotted underline-offset-2 hover:text-status-critical">
            {t.delManageLink}
          </button>
        </div>
      )}
    </div>
  );
}
