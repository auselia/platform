-- Makes memberships.role meaningful. Every write path in the app has only ever written
-- 'owner' (signup/actions.ts, dashboard/actions.ts's createOrganization) and nothing has
-- ever read it - every member, regardless of role, could write irrigation_config and flag
-- cavitation_captures. That's the gap org sharing needs closed before invites can hand out
-- anything less than full access.

-- Backfill first so the check constraint below can never fail. Confirmed via
-- `select role, count(*) from memberships group by role` on both dev and prod before
-- writing this: every existing row is already 'owner'. Still defensive, in case a row
-- was ever hand-inserted with something else.
update memberships set role = 'editor' where role not in ('owner');

alter table memberships
  add constraint memberships_role_check check (role in ('owner', 'editor', 'viewer'));

-- ============ helpers, same shape as is_org_member/is_demo_org/org_has_members ============
create or replace function is_org_owner(check_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from memberships
    where org_id = check_org_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Owner or editor: the "can write farm data" tier. Viewer is read-only.
create or replace function can_edit_org(check_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from memberships
    where org_id = check_org_id and user_id = auth.uid() and role in ('owner', 'editor')
  );
$$;

-- ============ memberships: owner can manage other members' roles/removal ============
-- select_own_memberships (user_id = auth.uid()) and insert_first_membership stay exactly
-- as they are - the member roster itself is read through list_org_members() below
-- (security definer, joins auth.users for email) rather than widening this table's own
-- SELECT policy, keeping the same "helpers in SQL" shape the rest of this schema uses.

create policy update_membership_role_as_owner on memberships for update
  using (is_org_owner(org_id) and role <> 'owner')
  with check (is_org_owner(org_id) and role in ('editor', 'viewer'));
  -- role <> 'owner' in the USING clause (not just excluded from the new value in WITH
  -- CHECK) is what actually stops an owner demoting themself - it makes the owner's own
  -- row ineligible for this policy to touch at all, rather than relying on the timing of
  -- when WITH CHECK re-evaluates is_org_owner() against a row this same statement is
  -- mid-way through changing. with check still excludes 'owner' too: no ownership-transfer
  -- path in v1, so this can never mint a second owner either.

create policy delete_membership_as_owner on memberships for delete
  using (is_org_owner(org_id) and role <> 'owner');
  -- role <> 'owner' blocks deleting the owner row (including your own) - "leave an org"
  -- is a separate, later feature, not this one.

-- Any member, any role, can see who else has access (Viewers included - same as Google
-- Drive's own "people with access" panel being visible to viewers).
create or replace function list_org_members(target_org_id uuid)
returns table(user_id uuid, email text, role text, joined_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_org_member(target_org_id) then
    raise exception 'not_a_member';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.created_at
    from memberships m join auth.users u on u.id = m.user_id
    where m.org_id = target_org_id
    order by m.created_at asc;
end;
$$;
revoke all on function list_org_members(uuid) from public;
grant execute on function list_org_members(uuid) to authenticated;

-- ============ tighten "any member" write policies to "editor or owner" ============
drop policy write_plants_as_member on plants;
create policy write_plants_as_editor on plants for insert with check (can_edit_org(org_id));

drop policy update_plants_as_member on plants;
create policy update_plants_as_editor on plants for update using (can_edit_org(org_id));

drop policy write_irrigation_config_as_member on irrigation_config;
create policy write_irrigation_config_as_editor on irrigation_config for insert
  with check (plant_id in (select id from plants where can_edit_org(org_id)));

drop policy update_irrigation_config_as_member on irrigation_config;
create policy update_irrigation_config_as_editor on irrigation_config for update
  using (plant_id in (select id from plants where can_edit_org(org_id)));

drop policy update_cavitation_flags_as_member on cavitation_captures;
create policy update_cavitation_flags_as_editor on cavitation_captures for update
  using (plant_id in (select id from plants where can_edit_org(org_id)))
  with check (plant_id in (select id from plants where can_edit_org(org_id)));
