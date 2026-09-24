-- Ceilings on what a single account can create, so a free signup can't be used to fill the
-- database or to send unlimited invitation emails. Generous for real use (a farm has a
-- handful of orgs/plants/collaborators); they only bite on scripted abuse. Raise them here
-- if a legitimate customer ever needs more.

-- ---- Organizations: at most 5 orgs owned per user (insert_own_org lets any signed-in user create one).
create or replace function limit_owned_orgs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'owner'
     and (select count(*) from memberships where user_id = new.user_id and role = 'owner') >= 5 then
    raise exception 'too_many_owned_orgs';
  end if;
  return new;
end;
$$;
create trigger memberships_limit_owned_orgs before insert on memberships
  for each row execute function limit_owned_orgs();

-- ---- Plants: at most 25 per org.
create or replace function limit_plants_per_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from plants where org_id = new.org_id) >= 25 then
    raise exception 'too_many_plants';
  end if;
  return new;
end;
$$;
create trigger plants_limit_per_org before insert on plants
  for each row execute function limit_plants_per_org();

-- ---- Invitations: each one sends an email from our domain. At most 20 created per org per
-- 24h and 25 pending at any time. (Resend is already limited to once per 5 minutes per invite.)
create or replace function limit_org_invitations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from org_invitations
      where org_id = new.org_id and created_at > now() - interval '24 hours') >= 20
     or (select count(*) from org_invitations
         where org_id = new.org_id and status = 'pending') >= 25 then
    raise exception 'too_many_invitations';
  end if;
  return new;
end;
$$;
create trigger org_invitations_limit before insert on org_invitations
  for each row execute function limit_org_invitations();

-- ---- Text sizes on user-created rows.
alter table organizations add constraint organizations_name_length check (char_length(name) between 1 and 200) not valid;
alter table plants add constraint plants_name_length check (char_length(name) between 1 and 200) not valid;
