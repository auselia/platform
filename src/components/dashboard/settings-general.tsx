"use client";

import type { DNode } from "@/lib/dashboard/types";
import type { Strings } from "@/lib/dashboard/i18n";

// A read-only identity card, not an edit form: Plant only has id/org_id/name/variety in the
// database, and there is no update mutation anywhere in the app for it or for an org. Adding
// one is a separate, later piece of work, not something to fake here.
export default function SettingsGeneral({
  node, orgName, t,
}: {
  node: DNode; orgName: string; t: Strings;
}) {
  const rows: [string, string][] = [
    [t.generalPlant, node.label],
    [t.generalVariety, node.variety ?? t.noVariety],
    [t.generalArea, node.area !== null ? `${node.area.toFixed(2)} ha` : t.waitingForData],
    [t.generalOrg, orgName],
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {rows.map(([k, v]) => (
        <div key={k} className="rounded-lg border border-border px-3.5 py-2.5">
          <div className="text-[9.5px] uppercase tracking-[0.04em] text-ink2">{k}</div>
          <div className="mt-0.5 font-mono text-[13px] font-semibold">{v}</div>
        </div>
      ))}
    </div>
  );
}
