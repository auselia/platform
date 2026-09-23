"use client";

import { useEffect, useState } from "react";
import type { Role } from "@/lib/types";
import type { Lang, Strings } from "@/lib/dashboard/i18n";
import {
  createInvite, revokeInvite, resendInvite, changeRole, removeMember, listMembers, listPendingInvites,
} from "@/app/dashboard/sharing-actions";
import { relTime } from "./ui";

type Member = { user_id: string; email: string; role: string; joined_at: string };
type Invite = { id: string; email: string; role: string; created_at: string };

const roleLabel = (t: Strings, r: string) =>
  r === "owner" ? t.shareRoleOwner : r === "editor" ? t.shareRoleEditor : t.shareRoleViewer;

// Google-Drive-style share dialog: everyone in the org sees the member list, only the
// owner sees pending invitations and the invite form (a plain note explains why, for
// anyone else). Triggered from farm-dashboard.tsx's header, shown whenever isLive.
export default function ShareDialog({
  orgId, orgName, role, t, lang, onClose,
}: {
  orgId: string; orgName: string; role: Role | null; t: Strings; lang: Lang; onClose: () => void;
}) {
  const isOwner = role === "owner";
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const [formOk, setFormOk] = useState(false);

  const load = async () => {
    const m = await listMembers(orgId);
    setMembers(m);
    if (isOwner) setInvites(await listPendingInvites(orgId));
  };

  useEffect(() => {
    load();
    // Best-effort own id, just to hide controls on your own row - not a security
    // boundary (RLS/the actions themselves already refuse to act on your own row).
    import("@/lib/supabase/client").then(({ createClient }) =>
      createClient().auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setFormError("");
    setFormOk(false);
    const r = await createInvite({ orgId, email, role: inviteRole, orgName, lang });
    setSending(false);
    if (r.ok) {
      setFormOk(true);
      setEmail("");
      await load();
    } else {
      setFormError(r.error);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="m-0 font-[family-name:var(--font-display)] text-[17px] font-semibold">
            {t.shareTitle.replace("{org}", orgName)}
          </h3>
          <button onClick={onClose} aria-label="Close" className="text-ink2 hover:text-ink">&times;</button>
        </div>

        <div className="mb-4">
          <div className="mb-2 text-[10.5px] uppercase tracking-[0.04em] text-ink2">{t.shareMembersHeading}</div>
          {!members ? (
            <div className="text-xs text-ink2">{t.loading}…</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {members.map((m) => (
                <MemberRow
                  key={m.user_id} m={m} t={t} isOwner={isOwner} isSelf={m.user_id === currentUserId}
                  onChange={async (r) => { await changeRole({ orgId, userId: m.user_id, role: r, lang }); await load(); }}
                  onRemove={async () => { await removeMember({ orgId, userId: m.user_id, lang }); await load(); }}
                />
              ))}
            </div>
          )}
        </div>

        {isOwner ? (
          <>
            <div className="mb-4">
              <div className="mb-2 text-[10.5px] uppercase tracking-[0.04em] text-ink2">{t.sharePendingHeading}</div>
              {!invites || invites.length === 0 ? (
                <div className="text-xs text-ink2">{t.shareNoPending}</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {invites.map((inv) => (
                    <InviteRow
                      key={inv.id} inv={inv} t={t}
                      onRevoke={async () => { await revokeInvite(inv.id, lang); await load(); }}
                      onResend={async () => {
                        await resendInvite({ inviteId: inv.id, orgId, orgName, email: inv.email, role: inv.role as "editor" | "viewer", lang });
                        await load();
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-[10.5px] uppercase tracking-[0.04em] text-ink2">{t.shareInviteHeading}</div>
              <form onSubmit={submitInvite} className="flex flex-wrap items-center gap-2">
                <input
                  type="email" required placeholder={t.shareEmailPh} value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-w-[180px] flex-1 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-ink"
                />
                <select
                  value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
                  aria-label={t.shareRoleLabel}
                  className="rounded-lg border border-border bg-bg px-2 py-1.5 text-xs font-semibold text-ink"
                >
                  <option value="editor">{t.shareRoleEditor}</option>
                  <option value="viewer">{t.shareRoleViewer}</option>
                </select>
                <button
                  type="submit" disabled={sending}
                  className="rounded-lg bg-amber px-3.5 py-1.5 text-xs font-semibold text-forest disabled:opacity-50"
                >
                  {sending ? t.shareSending : t.shareSendInvite}
                </button>
              </form>
              {formOk && <p className="mt-1.5 text-[11px] text-ink2">{t.shareInviteSent}</p>}
              {formError && <p className="mt-1.5 text-[11px] text-status-critical">{formError}</p>}
            </div>
          </>
        ) : (
          <p className="text-[11.5px] text-ink2">{t.shareViewOnlyNote}</p>
        )}
      </div>
    </div>
  );
}

function MemberRow({
  m, t, isOwner, isSelf, onChange, onRemove,
}: {
  m: Member; t: Strings; isOwner: boolean; isSelf: boolean;
  onChange: (r: "editor" | "viewer") => void; onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2">
      <span className="min-w-0 truncate text-[13px] text-ink">
        {m.email}{isSelf && <span className="text-ink2"> {t.shareYou}</span>}
      </span>
      {isOwner && !isSelf && m.role !== "owner" ? (
        <div className="flex flex-none items-center gap-1.5">
          <select
            value={m.role} onChange={(e) => onChange(e.target.value as "editor" | "viewer")}
            className="rounded-md border border-border bg-bg px-1.5 py-1 text-[11px] font-semibold text-ink"
          >
            <option value="editor">{t.shareRoleEditor}</option>
            <option value="viewer">{t.shareRoleViewer}</option>
          </select>
          <button onClick={onRemove} className="text-[11px] font-semibold text-status-critical">
            {t.shareRemove}
          </button>
        </div>
      ) : (
        <span className="flex-none text-[11px] font-semibold text-ink2">{roleLabel(t, m.role)}</span>
      )}
    </div>
  );
}

function InviteRow({
  inv, t, onRevoke, onResend,
}: {
  inv: Invite; t: Strings; onRevoke: () => void; onResend: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2">
      <div className="min-w-0">
        <div className="truncate text-[13px] text-ink">{inv.email}</div>
        <div className="text-[10.5px] text-ink2">{roleLabel(t, inv.role)} · {relTime(new Date(inv.created_at), t)}</div>
      </div>
      <div className="flex flex-none items-center gap-2">
        <button onClick={onResend} className="text-[11px] font-semibold text-accent">{t.shareResend}</button>
        <button onClick={onRevoke} className="text-[11px] font-semibold text-status-critical">{t.shareRevoke}</button>
      </div>
    </div>
  );
}
