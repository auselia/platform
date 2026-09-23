-- Oscilloscope controls. The lab PC cannot be reached from the internet (the logger publishes
-- nothing to the platform except what its uploader pushes out), so the dashboard never talks to
-- the scope. Instead it writes a row into scope_commands, and the PC polls for pending rows
-- through the scope-sync Edge Function, runs them locally, and writes the result back.
--
--   scope_state     what the PC last reported: current scope settings, the spec that describes
--                   them, snapshots, guard, drift and logger status. One row per plant.
--   scope_commands  the queue. Members with edit rights insert, only the Edge Function
--                   (service role) ever changes a row after that.
--
-- The PC validates every command again before it touches the scope, so this is a second layer.

create table scope_state (
  plant_id uuid primary key references plants(id) on delete cascade,
  spec jsonb not null default '[]'::jsonb,       -- setting definitions (id, group, label, type, options, unit, mult)
  settings jsonb,                                -- current value of each setting, null when the scope is unreachable
  sweep text,
  run_state text,
  scope_error text,
  snapshots jsonb not null default '[]'::jsonb,
  guard jsonb,
  drift jsonb not null default '[]'::jsonb,
  logger jsonb not null default '{}'::jsonb,     -- state, free_gb, last_trigger_age_s, alerts
  updated_at timestamptz not null default now(),
  constraint scope_state_size check (octet_length(spec::text) <= 100000 and octet_length(coalesce(settings::text, '')) <= 20000)
);

alter table scope_state enable row level security;

create policy select_scope_state_in_scope on scope_state for select
  using (plant_id in (select id from plants where is_org_member(org_id)));

revoke insert, update, delete on scope_state from anon, authenticated;

create table scope_commands (
  id bigint generated always as identity primary key,
  plant_id uuid not null references plants(id) on delete cascade,
  kind text not null check (kind in ('settings_apply', 'snapshot_save', 'snapshot_apply', 'snapshot_delete', 'guard')),
  payload jsonb not null default '{}'::jsonb check (octet_length(payload::text) <= 20000),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'expired')),
  result jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz
);
create index idx_scope_commands_plant on scope_commands(plant_id, created_at desc);
create index idx_scope_commands_open on scope_commands(plant_id) where status in ('pending', 'running');

alter table scope_commands enable row level security;

create policy select_scope_commands_in_scope on scope_commands for select
  using (plant_id in (select id from plants where is_org_member(org_id)));

-- Owner or editor only. A viewer reads the settings but never changes them. The command always
-- starts as pending and is always attributed to the caller.
create policy insert_scope_commands_as_editor on scope_commands for insert
  with check (
    status = 'pending'
    and created_by = auth.uid()
    and plant_id in (select id from plants where can_edit_org(org_id))
  );

revoke insert, update, delete on scope_commands from anon, authenticated;
grant insert (plant_id, kind, payload, created_by) on scope_commands to authenticated;

-- At most 5 open commands per plant, so a stuck PC cannot pile up an unbounded queue.
create or replace function limit_open_scope_commands()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from scope_commands
      where plant_id = new.plant_id and status in ('pending', 'running')) >= 5 then
    raise exception 'too_many_open_scope_commands';
  end if;
  return new;
end;
$$;

create trigger scope_commands_limit before insert on scope_commands
  for each row execute function limit_open_scope_commands();
