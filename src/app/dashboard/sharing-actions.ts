"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { STR, type Lang } from "@/lib/dashboard/i18n";
import { sendOrgInvite } from "@/lib/dashboard/email";
import { INVITE_TTL_MS, RESEND_COOLDOWN_MS, sentAtFromExpiry } from "@/lib/dashboard/invites";

// All of these run through the normal RLS-scoped client, never service-role - the RLS
// policies and accept_org_invitation() (supabase/migrations/20260923*.sql) are the real
// authorization boundary. These just turn a Postgres error into a friendly one and skip
// acting on your own row client-side too (simpler than disabling a control and explaining
// why in copy).

type Result = { ok: true } | { ok: false; error: string };

export async function createInvite(input: {
  orgId: string; email: string; role: "editor" | "viewer"; orgName: string; lang: Lang;
}): Promise<Result> {
  const t = STR[input.lang];
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: t.shareErrorGeneric };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t.shareErrorGeneric };

  const { data, error } = await supabase
    .from("org_invitations")
    .insert({ org_id: input.orgId, email, role: input.role, invited_by: user.id })
    .select("token")
    .single();

  if (error) {
    return { ok: false, error: error.code === "23505" ? t.shareErrorAlready : t.shareErrorGeneric };
  }

  const origin = (await headers()).get("origin");
  try {
    await sendOrgInvite({
      to: email,
      orgName: input.orgName,
      inviterEmail: user.email ?? "",
      role: input.role,
      acceptUrl: `${origin}/accept-invite?token=${data.token}`,
      lang: input.lang,
    });
  } catch (e) {
    console.error("Failed to send invite email", e);
    revalidatePath("/dashboard");
    return { ok: false, error: t.shareErrorEmailFailed };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function revokeInvite(inviteId: string, lang: Lang): Promise<Result> {
  const t = STR[lang];
  const supabase = await createClient();
  const { error } = await supabase.from("org_invitations").update({ status: "revoked" }).eq("id", inviteId);
  if (error) return { ok: false, error: t.shareErrorGeneric };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function resendInvite(input: {
  inviteId: string; orgId: string; orgName: string; email: string; role: "editor" | "viewer"; lang: Lang;
}): Promise<Result> {
  const t = STR[input.lang];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t.shareErrorGeneric };

  const { data: current } = await supabase
    .from("org_invitations")
    .select("expires_at")
    .eq("id", input.inviteId)
    .eq("status", "pending")
    .maybeSingle();
  if (!current) return { ok: false, error: t.shareErrorGeneric };
  if (Date.now() - sentAtFromExpiry(current.expires_at) < RESEND_COOLDOWN_MS) {
    return { ok: false, error: t.shareResendWait };
  }

  // A fresh token/expiry rotates out the old email link, same crypto.randomUUID() pattern
  // already used for org ids elsewhere in this codebase (signup/actions.ts). Matching on the
  // expires_at we just read makes two simultaneous clicks race safely: only one update lands.
  const { data, error } = await supabase
    .from("org_invitations")
    .update({ token: crypto.randomUUID(), expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString() })
    .eq("id", input.inviteId)
    .eq("status", "pending")
    .eq("expires_at", current.expires_at)
    .select("token")
    .maybeSingle();

  if (error || !data) return { ok: false, error: t.shareResendWait };

  const origin = (await headers()).get("origin");
  try {
    await sendOrgInvite({
      to: input.email,
      orgName: input.orgName,
      inviterEmail: user.email ?? "",
      role: input.role,
      acceptUrl: `${origin}/accept-invite?token=${data.token}`,
      lang: input.lang,
    });
  } catch (e) {
    console.error("Failed to resend invite email", e);
    return { ok: false, error: t.shareErrorEmailFailed };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function changeRole(input: { orgId: string; userId: string; role: "editor" | "viewer"; lang: Lang }): Promise<Result> {
  const t = STR[input.lang];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id === input.userId) return { ok: false, error: t.shareErrorGeneric };

  const { error } = await supabase
    .from("memberships")
    .update({ role: input.role })
    .eq("org_id", input.orgId)
    .eq("user_id", input.userId);
  if (error) return { ok: false, error: t.shareErrorGeneric };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function removeMember(input: { orgId: string; userId: string; lang: Lang }): Promise<Result> {
  const t = STR[input.lang];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id === input.userId) return { ok: false, error: t.shareErrorGeneric };

  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("org_id", input.orgId)
    .eq("user_id", input.userId);
  if (error) return { ok: false, error: t.shareErrorGeneric };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function listMembers(orgId: string): Promise<{ user_id: string; email: string; role: string; joined_at: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_org_members", { target_org_id: orgId });
  if (error) return [];
  return data ?? [];
}

export async function listPendingInvites(orgId: string): Promise<
  { id: string; email: string; role: string; sent_at: number }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_invitations")
    .select("id, email, role, expires_at")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map(({ expires_at, ...rest }) => ({ ...rest, sent_at: sentAtFromExpiry(expires_at) }));
}
