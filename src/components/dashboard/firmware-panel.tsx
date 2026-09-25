"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Strings } from "@/lib/dashboard/i18n";
import { checkFirmwareFile, firmwarePath, sha256Hex, type FirmwareProblem } from "@/lib/dashboard/firmware";
import { Modal, danger, fill, quiet } from "./capture-delete-dialogs";
import { relTime } from "./ui";

type Release = { id: string; version: string; size_bytes: number; created_at: string };

const field = "rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-ink";

// Settings > Device, Owners only. Uploading and rolling out firmware pushes code to a physical
// device that may be far away, so this is off for every device until Auselia enables it
// (ota_enabled_plants), and every write goes through owner-checked database functions
// (20260925020000_firmware_ota.sql). Rolling out needs a typed confirmation that spells out
// the one risk there is no remote fix for.
export default function FirmwarePanel({ supabase, plantId, t }: { supabase: SupabaseClient; plantId: string; t: Strings }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirming, setConfirming] = useState<Release | null>(null);
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data: on } = await supabase.from("ota_enabled_plants").select("plant_id").eq("plant_id", plantId).maybeSingle();
    setEnabled(!!on);
    if (!on) return;
    const [rel, tgt] = await Promise.all([
      supabase.from("firmware_releases").select("id,version,size_bytes,created_at").eq("plant_id", plantId).order("created_at", { ascending: false }),
      supabase.from("firmware_target").select("release_id").eq("plant_id", plantId).maybeSingle(),
    ]);
    setReleases((rel.data ?? []) as Release[]);
    setTargetId((tgt.data as { release_id: string } | null)?.release_id ?? null);
  }, [supabase, plantId]);

  useEffect(() => { void load(); }, [load]);

  const problemText: Record<FirmwareProblem, string> = { version: t.fwErrVersion, size: t.fwErrSize, magic: t.fwErrMagic };

  async function upload() {
    setMsg(null);
    if (!file) { setMsg({ text: t.fwErrNoFile, ok: false }); return; }
    const v = version.trim();
    setBusy(true);
    const buf = await file.arrayBuffer();
    const problem = checkFirmwareFile(v, new Uint8Array(buf));
    if (problem) { setBusy(false); setMsg({ text: problemText[problem], ok: false }); return; }

    const path = firmwarePath(plantId, v);
    const up = await supabase.storage.from("firmware").upload(path, file, { contentType: "application/octet-stream", upsert: false });
    if (up.error) {
      setBusy(false);
      setMsg({ text: /exist|duplicate/i.test(up.error.message) ? t.fwErrExists : t.fwErrGeneric, ok: false });
      return;
    }
    const reg = await supabase.rpc("register_firmware", {
      target_plant: plantId, fw_version: v, fw_path: path, fw_size: file.size, fw_sha256: await sha256Hex(buf),
    });
    if (reg.error) {
      // Do not leave an unregistered file behind, or the same version could never be retried.
      await supabase.storage.from("firmware").remove([path]);
      setBusy(false);
      setMsg({ text: /duplicate|unique/i.test(reg.error.message) ? t.fwErrExists : t.fwErrGeneric, ok: false });
      return;
    }
    setBusy(false);
    setFile(null);
    setVersion("");
    if (input.current) input.current.value = "";
    setMsg({ text: t.fwUploaded, ok: true });
    await load();
  }

  async function setTarget(release: string | null) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("set_firmware_target", { target_plant: plantId, release });
    setBusy(false);
    setConfirming(null);
    setTyped("");
    if (error) { setMsg({ text: t.fwFailed, ok: false }); return; }
    if (release === null) setMsg({ text: t.fwStopped, ok: true });
    await load();
  }

  if (enabled === null) return null;
  if (!enabled) {
    return (
      <section className="rounded-lg border border-border px-3.5 py-3">
        <div className="text-[13px] font-semibold">{t.fwTitle}</div>
        <p className="mt-0.5 text-[11.5px] text-ink2">{t.fwOff}</p>
      </section>
    );
  }

  const target = releases.find((r) => r.id === targetId) ?? null;
  const typedOk = confirming !== null && typed.trim().toLowerCase() === t.fwWord.toLowerCase();

  return (
    <section className="rounded-lg border border-border">
      <div className="border-b border-border px-3.5 py-2.5">
        <div className="text-[13px] font-semibold">{t.fwTitle}</div>
        <p className="mt-0.5 text-[11.5px] text-ink2">{t.fwHint}</p>
      </div>

      <div className="flex flex-col gap-3 px-3.5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className={target ? "font-semibold" : "text-ink2"}>{target ? fill(t.fwTarget, { v: target.version }) : t.fwNoTarget}</span>
          {target && <button onClick={() => setTarget(null)} disabled={busy} className={quiet}>{t.fwStop}</button>}
        </div>

        <div>
          <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.04em] text-ink2">{t.fwUploadTitle}</div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[10.5px] uppercase tracking-[0.04em] text-ink2">
              {t.fwVersion}
              <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder={t.fwVersionPh} maxLength={32} disabled={busy} className={`${field} w-28 font-mono`} />
            </label>
            <input ref={input} type="file" accept=".bin" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} aria-label={t.fwChoose} className="max-w-[16rem] text-xs text-ink2" />
            <button onClick={upload} disabled={busy} className="rounded-lg bg-amber px-3.5 py-2 text-xs font-semibold text-forest disabled:opacity-50">
              {busy ? t.fwUploading : t.fwUpload}
            </button>
          </div>
          {msg && <p className={`mt-1.5 text-[11.5px] ${msg.ok ? "text-ink2" : "text-status-critical"}`}>{msg.text}</p>}
        </div>

        <div>
          <div className="mb-1.5 text-[10.5px] uppercase tracking-[0.04em] text-ink2">{t.fwBuilds}</div>
          {releases.length === 0 ? (
            <div className="text-xs text-ink2">{t.fwNone}</div>
          ) : (
            <ul className="m-0 list-none rounded-lg border border-border p-0">
              {releases.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2 text-xs last:border-b-0">
                  <span className="font-mono font-semibold">{r.version}</span>
                  <span className="text-ink2">{Math.round(r.size_bytes / 1024)} KB</span>
                  <span className="text-ink2">{relTime(new Date(r.created_at), t)}</span>
                  <span className="ml-auto">
                    {r.id === targetId ? (
                      <span className="rounded-full border border-accent px-2 py-px font-mono text-[10px] font-semibold uppercase text-accent">{t.fwOnDevice}</span>
                    ) : (
                      <button onClick={() => { setConfirming(r); setTyped(""); }} disabled={busy} className="font-semibold text-accent disabled:opacity-50">{t.fwRollOut}</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirming && (
        <Modal onClose={() => setConfirming(null)} locked={busy}>
          <h3 className="m-0 font-[family-name:var(--font-display)] text-[17px] font-semibold">{fill(t.fwConfirmTitle, { v: confirming.version })}</h3>
          <p className="mt-2 rounded-lg border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-[12.5px] text-ink">{t.fwConfirmWarn}</p>
          <label className="mt-3 flex flex-col gap-1 text-xs text-ink2">
            {fill(t.delTypeToConfirm, { word: t.fwWord })}
            <input value={typed} onChange={(e) => setTyped(e.target.value)} disabled={busy} autoComplete="off" className={field} />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setConfirming(null)} disabled={busy} autoFocus className={quiet}>{t.cancel}</button>
            <button onClick={() => setTarget(confirming.id)} disabled={busy || !typedOk} className={danger}>{t.fwConfirmBtn}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
