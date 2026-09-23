-- Invites: how a second person ever gets into an org that already has members. Bypasses
-- memberships' own insert_first_membership policy (self-insert only into a zero-member
-- org) on purpose, through the one narrow, validated door below - never a wider policy.

create table org_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('editor', 'viewer')), -- never 'owner': no ownership-transfer path in v1
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id)
);
create unique index idx_org_invitations_pending_email
  on org_invitations(org_id, lower(email)) where status = 'pending';
create index idx_org_invitations_token on org_invitations(token);

alter table org_invitations enable row level security;

-- Only the org's owner can create, see, or revoke/resend invitations for it. The invitee
-- never gets direct table access at all - accept_org_invitation() below does its own
-- validation and is the only path in, so there's no "look up my own invite" SELECT policy.
create policy owner_select_invitations on org_invitations for select
  using (is_org_owner(org_id));
create policy owner_insert_invitations on org_invitations for insert
  with check (is_org_owner(org_id) and invited_by = auth.uid());
create policy owner_update_invitations on org_invitations for update
  using (is_org_owner(org_id)) with check (is_org_owner(org_id));

create or replace function accept_org_invitation(invite_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv org_invitations%rowtype;
  caller_email text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select email into caller_email from auth.users where id = auth.uid();

  select * into inv from org_invitations where token = invite_token for update;
  if not found then
    raise exception 'invite_not_found';
  end if;
  if inv.status <> 'pending' then
    raise exception 'invite_not_pending';
  end if;
  if inv.expires_at < now() then
    raise exception 'invite_expired';
  end if;
  if lower(inv.email) <> lower(caller_email) then
    raise exception 'invite_email_mismatch';
  end if;

  insert into memberships (user_id, org_id, role)
  values (auth.uid(), inv.org_id, inv.role)
  on conflict (user_id, org_id) do update set role = excluded.role;

  update org_invitations set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  where id = inv.id;

  return jsonb_build_object('org_id', inv.org_id);
end;
$$;
revoke all on function accept_org_invitation(uuid) from public;
grant execute on function accept_org_invitation(uuid) to authenticated;
