"use client";

import type { CavitationSummary } from "@/lib/types";
import type { Strings } from "@/lib/dashboard/i18n";
import ScopeSettings from "./scope-settings";
import { relTime } from "./ui";

// Capture status from the summary the shell already fetches, plus the oscilloscope controls for a
// live plant. The controls do not reach the scope: they queue commands that the lab PC picks up
// (see scope-settings.tsx). The demo plant has no scope, so it shows status only.
export default function SettingsStress({
  summary, loaded, t, advanced, onAdvanced, plantId, isLive, canEdit, onManage, recentlyDeleted,
}: {
  summary: CavitationSummary | null; loaded: boolean; t: Strings;
  advanced: boolean; onAdvanced: (v: boolean) => void;
  plantId: string; isLive: boolean; canEdit: boolean;
  // Owners only (undefined for everyone else): shows the danger zone.
  onManage?: () => void;
  // Owners only: the Recently deleted list, shown just above the danger zone.
  recentlyDeleted?: React.ReactNode;
}) {
  const tiles: [string, string][] = summary ? [
    [t.cavLast24h, String(summary.last_24h)],
    [t.cavLast7d, String(summary.last_7d)],
    [t.cavFlagged, String(summary.flagged)],
    [t.oscTotalCaptures, String(summary.total)],
  ] : [];

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[13px] text-ink2">{t.oscExplain}</p>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5">
        <div>
          <div className="text-[13px] font-semibold">{t.oscAdvancedLabel}</div>
          <p className="mt-0.5 text-[11.5px] text-ink2">{t.oscAdvancedHint}</p>
        </div>
        <button
          role="switch"
          aria-checked={advanced}
          aria-label={`${t.oscAdvancedLabel}: ${advanced ? t.oscAdvancedLabelOn : t.oscAdvancedLabelOff}`}
          onClick={() => onAdvanced(!advanced)}
          className={`relative h-6 w-11 flex-none rounded-full transition-colors ${advanced ? "bg-accent" : "bg-border"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-bg transition-transform ${advanced ? "translate-x-[22px]" : "translate-x-0.5"}`}
          />
        </button>
      </div>

      {!loaded ? (
        <div className="text-xs text-ink2">{t.loading}…</div>
      ) : !summary || summary.total === 0 ? (
        <div className="rounded-[10px] border border-dashed border-border px-3.5 py-6 text-center text-[12.5px] text-ink2">
          {t.oscNoCaptures}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {tiles.map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border px-3.5 py-2.5">
                <div className="text-[9.5px] uppercase tracking-[0.04em] text-ink2">{k}</div>
                <div className="mt-0.5 font-mono text-[13px] font-semibold">{v}</div>
              </div>
            ))}
          </div>
          {summary.last_capture_at && (
            <div className="rounded-lg border border-border px-3.5 py-2.5">
              <div className="text-[9.5px] uppercase tracking-[0.04em] text-ink2">{t.cavLastCapture}</div>
              <div className="mt-0.5 font-mono text-[13px] font-semibold">
                {relTime(new Date(summary.last_capture_at), t)}
              </div>
            </div>
          )}
        </>
      )}

      {isLive && <ScopeSettings plantId={plantId} canEdit={canEdit} t={t} />}

      {recentlyDeleted}

      {onManage && (
        <section className="mt-3 rounded-lg border border-status-critical/40">
          <div className="border-b border-status-critical/40 px-3.5 py-2 text-[12px] font-semibold text-status-critical">{t.delSection}</div>
          <div className="flex items-center justify-between gap-3 px-3.5 py-3">
            <div>
              <div className="text-[13px] font-semibold">{t.delTitle}</div>
              <p className="mt-0.5 text-[11.5px] text-ink2">{t.delSectionHint}</p>
            </div>
            <button
              onClick={onManage}
              className="flex-none rounded-lg border border-status-critical/60 px-3 py-1.5 text-xs font-semibold text-status-critical hover:bg-status-critical/10"
            >
              {t.delManageBtn}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
