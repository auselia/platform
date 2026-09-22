"use client";

import type { Status } from "@/lib/status";
import { STATUS_COLOR } from "@/lib/status";
import StatusIcon from "@/components/status-icon";
import type { Strings } from "@/lib/dashboard/i18n";

export function statusLabel(s: Status, t: Strings) {
  return s === "critical" ? t.statusCritical : s === "warning" ? t.statusWarning : s === "good" ? t.statusGood : t.statusNoData;
}

export function StatusPill({ status, t }: { status: Status; t: Strings }) {
  return (
    <span
      className="inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.03em] text-ink"
      style={{ background: `color-mix(in srgb, ${STATUS_COLOR[status]} 16%, var(--surface))` }}
    >
      <span className="inline-flex" style={{ color: STATUS_COLOR[status] }}>
        <StatusIcon status={status} size={9} />
      </span>
      {statusLabel(status, t)}
    </span>
  );
}

export function Segmented<T extends string>({
  value, options, onChange, mono,
}: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; mono?: boolean;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mono ? "font-mono uppercase tracking-[0.03em]" : ""} ${
            value === o.value ? "bg-accent text-accent-ink" : "text-ink2"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Amber is reserved for signal. A flagged capture is the strongest signal we have.
export function FlagMark({ title }: { title: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" role="img" aria-label={title} className="flex-none text-amber">
      <title>{title}</title>
      <circle cx="6" cy="6" r="3.2" fill="currentColor" />
      <circle cx="6" cy="6" r="5.4" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.55" />
    </svg>
  );
}

export function relTime(d: Date, t: Strings) {
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return t.justNow;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}${t.minAgo}`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}${t.hrAgo}`;
  return `${Math.round(h / 24)}${t.dayAgo}`;
}
