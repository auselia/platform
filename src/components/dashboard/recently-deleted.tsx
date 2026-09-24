"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Strings } from "@/lib/dashboard/i18n";
import { CLASS_KEY } from "@/lib/dashboard/cavitation";
import { RETENTION_HOURS, listDeleted, purge, restore, type DeletedRow } from "@/lib/dashboard/cavitation-delete";
import { DeleteForeverDialog, fill, quiet } from "./capture-delete-dialogs";
import { FlagMark } from "./ui";

const HOUR = 3600000;

function timeLeft(t: Strings, deletedAt: string, now: number) {
  const left = new Date(deletedAt).getTime() + RETENTION_HOURS * HOUR - now;
  if (left <= 0) return t.rdExpired;
  const h = Math.floor(left / HOUR);
  const m = Math.floor((left % HOUR) / 60000);
  return fill(t.rdLeft, { left: h > 0 ? `${h} h ${m} min` : `${Math.max(1, m)} min` });
}

// Settings > Stress events, owners only: what was deleted in the last 24 hours, with Restore.
// The list comes from a function that returns nothing to anyone who is not the org's owner.
export default function RecentlyDeleted({
  supabase, plantId, refreshKey, t, locale, onChanged,
}: {
  supabase: SupabaseClient; plantId: string; refreshKey: number; t: Strings; locale: string | undefined;
  onChanged: (restored: number) => void;
}) {
  const [rows, setRows] = useState<DeletedRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [forever, setForever] = useState(false);

  useEffect(() => {
    let alive = true;
    listDeleted(supabase, plantId).then((r) => {
      if (!alive) return;
      setFailed(r === null);
      if (r) setRows(r);
    });
    return () => { alive = false; };
  }, [supabase, plantId, refreshKey]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  async function restoreThese(ids?: number[]) {
    setBusy(true);
    const n = await restore(supabase, plantId, { ids });
    setBusy(false);
    onChanged(n ?? 0);
  }

  const total = rows?.[0]?.total ?? 0;

  return (
    <section className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-2">
        <div>
          <div className="text-[13px] font-semibold">{t.rdTitle}</div>
          <p className="mt-0.5 text-[11.5px] text-ink2">{t.rdHint}</p>
        </div>
        {rows && rows.length > 0 && (
          <div className="flex flex-none items-center gap-2">
            <button onClick={() => restoreThese()} disabled={busy} className={quiet}>{t.rdRestoreAll}</button>
            <button
              onClick={() => setForever(true)} disabled={busy}
              className="rounded-lg border border-status-critical/60 px-3.5 py-2 text-xs font-semibold text-status-critical hover:bg-status-critical/10 disabled:opacity-45"
            >
              {t.rdForeverAll}
            </button>
          </div>
        )}
      </div>

      {failed ? (
        <div className="px-3.5 py-4 text-xs text-status-critical">{t.rdLoadFailed}</div>
      ) : !rows ? (
        <div className="px-3.5 py-4 text-xs text-ink2">{t.loading}…</div>
      ) : rows.length === 0 ? (
        <div className="px-3.5 py-4 text-xs text-ink2">{t.rdNone}</div>
      ) : (
        <>
          <ul className="m-0 max-h-60 list-none overflow-y-auto p-0">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3.5 py-2 text-xs last:border-b-0">
                <span className="font-mono">{new Date(r.ts).toLocaleString(locale, { dateStyle: "short", timeStyle: "medium" })}</span>
                <span className="text-ink2">{t[CLASS_KEY[r.cls]]}</span>
                {r.flagged && <FlagMark title={t.cavFlagged} />}
                <span className="ml-auto text-ink2">{timeLeft(t, r.deleted_at, now)}</span>
                <button onClick={() => restoreThese([r.id])} disabled={busy} className="font-semibold text-accent disabled:opacity-50">
                  {t.rdRestore}
                </button>
              </li>
            ))}
          </ul>
          {total > rows.length && (
            <div className="border-t border-border/60 px-3.5 py-2 text-[11.5px] text-ink2">
              {fill(t.rdMore, { n: (total - rows.length).toLocaleString(locale) })}
            </div>
          )}
        </>
      )}

      {forever && (
        <DeleteForeverDialog
          count={total || rows?.length || 0} t={t} onClose={() => setForever(false)}
          onConfirm={async () => {
            const r = await purge(supabase, plantId);
            if (!r.failed) onChanged(0);
            return !r.failed;
          }}
        />
      )}
    </section>
  );
}
