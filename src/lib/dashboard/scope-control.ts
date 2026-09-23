import type { ScopeCommand, ScopeSettingSpec } from "@/lib/types";

// Pure helpers behind the oscilloscope controls. Values are held in the scope's own units (volts,
// seconds), the form shows them in the spec's display unit (mV, µs).

// The PC reports every 30 s. Two missed reports means it is offline, and the server drops commands
// after two minutes anyway, so controls stay off until the PC is back.
export const PC_ONLINE_S = 120;

export type Edit = string | number | boolean;
export type Edits = Record<string, Edit>;

export const pcAgeSeconds = (updatedAt: string | null | undefined, now = Date.now()) =>
  updatedAt ? Math.max(0, Math.round((now - new Date(updatedAt).getTime()) / 1000)) : null;

export const pcOnline = (updatedAt: string | null | undefined, now = Date.now()) => {
  const age = pcAgeSeconds(updatedAt, now);
  return age !== null && age <= PC_ONLINE_S;
};

// Ordered groups, in the order the PC lists them.
export function groupSpec(spec: ScopeSettingSpec[]): { group: string; items: ScopeSettingSpec[] }[] {
  const out: { group: string; items: ScopeSettingSpec[] }[] = [];
  for (const s of spec) {
    const g = out.find((x) => x.group === s.group);
    if (g) g.items.push(s);
    else out.push({ group: s.group, items: [s] });
  }
  return out;
}

// Value as the form shows it. Six significant digits hide float noise such as 0.07100000000000001.
export function toDisplay(s: ScopeSettingSpec, v: number | string | undefined | null): Edit {
  if (v === undefined || v === null) return "";
  if (s.type === "num") return String(Number((Number(v) * s.mult).toPrecision(6)));
  if (s.type === "bool") return Number(v) === 1;
  return String(v);
}

// Text typed in a number field, back to the scope's unit. Null when it is not a finite number.
export function parseNumber(text: string, mult: number): number | null {
  const t = text.trim().replace(",", ".");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const n = Number(t) / mult;
  return Number.isFinite(n) ? n : null;
}

const sameNum = (a: number, b: number) => Math.abs(a - b) <= 1e-3 * Math.max(Math.abs(a), Math.abs(b), 1e-12);

// The command payload for what the person edited: only settings that differ from the scope, in the
// scope's units. `errors` maps a setting id to the reason it cannot be sent.
export function buildChanges(
  spec: ScopeSettingSpec[], current: Record<string, number | string>, edits: Edits,
): { changes: Record<string, number | string | boolean>; errors: Record<string, "number" | "value"> } {
  const changes: Record<string, number | string | boolean> = {};
  const errors: Record<string, "number" | "value"> = {};
  for (const s of spec) {
    if (!(s.id in edits)) continue;
    const e = edits[s.id];
    const now = current[s.id];
    if (s.type === "num") {
      const n = typeof e === "number" ? e / s.mult : parseNumber(String(e), s.mult);
      if (n === null) { errors[s.id] = "number"; continue; }
      if (now === undefined || !sameNum(n, Number(now))) changes[s.id] = n;
    } else if (s.type === "bool") {
      const want = e === true || e === "true" || e === 1;
      if (now === undefined || want !== (Number(now) === 1)) changes[s.id] = want;
    } else {
      const opt = s.options.find((o) => o.reply === e || o.send === e);
      if (!opt) { errors[s.id] = "value"; continue; }
      if (now !== opt.reply) changes[s.id] = opt.reply;
    }
  }
  return { changes, errors };
}

// Latest command of a kind that is still open or just finished, for the status line.
export const isOpen = (c: Pick<ScopeCommand, "status">) => c.status === "pending" || c.status === "running";

export const errorText = (c: Pick<ScopeCommand, "result">) =>
  c.result?.error ?? (c.result?.errors && c.result.errors.length ? c.result.errors.join("; ") : "");

// Snapshot names go through the PC's clean_name, so mirror it to show what will be saved.
export const cleanSnapshotName = (name: string) => name.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
