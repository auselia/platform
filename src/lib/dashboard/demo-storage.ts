"use client";

// Sandbox persistence for the public demo org: sessionStorage, not localStorage, so a demo
// visitor's changes (an edited irrigation schedule, the Advanced-view toggle) survive
// reloads/navigation in one tab but vanish when the tab or browser closes, instead of
// lingering forever like a real account's would. Live orgs are unaffected - they keep
// localStorage (tab-shell.tsx) and the real Supabase upsert (farm-dashboard.tsx).
const NS = "auselia-demo";

export function demoStorageGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(`${NS}:${key}`);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function demoStorageSet<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(`${NS}:${key}`, JSON.stringify(value));
  } catch {}
}
