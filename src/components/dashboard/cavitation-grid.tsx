"use client";

import type { Cavitation, CavitationSummary } from "@/lib/types";
import type { Strings } from "@/lib/dashboard/i18n";
import { CLASS_KEY } from "@/lib/dashboard/cavitation";
import type { CavitationFilter } from "@/lib/dashboard/use-cavitation-data";
import { FlagMark, Segmented, relTime } from "./ui";

// Center column of focus mode for the Cavitations tab: browse many captures at a glance.
// A click picks one to inspect in the right-column CavitationDetails; a double-click skips
// straight to the full analysis dialog for it, same shortcut people expect from a file grid.
export default function CavitationGrid({
  items, summary, filter, onFilter, hasMore, onOlder, scopedToRange,
  selectedId, onSelect, onOpen, t, locale,
}: {
  items: Cavitation[]; summary: CavitationSummary | null;
  filter: CavitationFilter; onFilter: (f: CavitationFilter) => void;
  hasMore: boolean; onOlder: () => void;
  // true when a day/range is picked: "no captures" means none in that window, not ever.
  scopedToRange: boolean;
  selectedId: number | null; onSelect: (id: number) => void; onOpen: () => void;
  t: Strings; locale: string | undefined;
}) {
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
              onClick={() => onSelect(c.id)}
              onDoubleClick={() => { onSelect(c.id); onOpen(); }}
              aria-current={c.id === selectedId}
              className={`flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left text-xs ${
                c.id === selectedId ? "border-accent bg-surface-2" : "border-border hover:bg-surface-2"
              }`}
            >
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {c.flagged ? <FlagMark title={t.cavFlagged} /> : <span className="inline-block w-3" />}
                <span className="whitespace-nowrap font-mono text-[11px]">{d.toLocaleDateString(locale, { month: "short", day: "numeric" })}</span>
                <span className="whitespace-nowrap font-mono text-[11px] text-ink2">{d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</span>
              </span>
              <span className="text-ink2">{t[CLASS_KEY[c.cls]]}</span>
              <span className="flex justify-between font-mono text-ink2">
                <span>{c.peak_mv !== null ? `${c.peak_mv} mV` : "-"}</span>
                <span>{c.freq_khz !== null ? `${c.freq_khz} kHz` : "-"}</span>
              </span>
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
    </div>
  );
}
