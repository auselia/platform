"use client";

import { useMemo, useState } from "react";
import type { Lang, Strings } from "@/lib/dashboard/i18n";
import { dayKey } from "@/lib/dashboard/env";

// A small month calendar for jumping the focus-mode chart or capture grid to a specific
// day. `days` is the set of dayKey()s that have data for whatever the current tab shows
// (readings on Environment, captures on Stress events); the rest are dimmed and not clickable. The visible month only
// moves via the prev/next buttons, never on its own, so browsing doesn't jump under the
// user while dayAnchor changes from clicking a day.
export default function DayPicker({
  days, anchor, dayAnchor, onDayAnchor, t, lang,
}: {
  days: ReadonlySet<string>; anchor: number; dayAnchor: Date | null;
  onDayAnchor: (d: Date) => void; t: Strings; lang: Lang;
}) {
  const selected = dayAnchor ?? new Date(anchor);
  const [view, setView] = useState(() => ({ y: selected.getFullYear(), m: selected.getMonth() }));
  const locale = lang === "es" ? "es-CL" : undefined;

  const selKey = dayKey(selected);
  const todayKey = dayKey(new Date());

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first offset
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const out: (Date | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(view.y, view.m, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [view]);

  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
          aria-label={t.monthPrev} className="rounded-md px-1.5 py-0.5 text-ink2 hover:bg-surface-2 hover:text-ink"
        >
          &lsaquo;
        </button>
        <span className="text-[11.5px] font-semibold capitalize text-ink">{monthLabel}</span>
        <button
          onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
          aria-label={t.monthNext} className="rounded-md px-1.5 py-0.5 text-ink2 hover:bg-surface-2 hover:text-ink"
        >
          &rsaquo;
        </button>
      </div>
      <div className="grid grid-cols-7 gap-[2px] text-center">
        {t.dow.map((d) => (
          <span key={d} className="text-[9.5px] font-semibold uppercase tracking-[0.03em] text-ink2">{d[0]}</span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const k = dayKey(d);
          const has = days.has(k);
          const isSelected = k === selKey;
          const isToday = k === todayKey;
          return (
            <button
              key={i}
              disabled={!has}
              onClick={() => onDayAnchor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999))}
              title={has ? undefined : t.waitingForData}
              className={`aspect-square rounded-[5px] text-[10.5px] ${
                isSelected
                  ? "bg-accent text-accent-ink font-semibold"
                  : has
                    ? `text-ink hover:bg-surface-2 ${isToday ? "font-semibold" : ""}`
                    : "cursor-default text-ink2 opacity-35"
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
