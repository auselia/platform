-- Deleting captures now hides them for 24 hours instead of destroying them at once, so a
-- wrong selection can be undone and a logger that re-sends the same captures (ingest ignores
-- duplicates by plant + capture_key) cannot bring a deleted flood back while the hold lasts.
--
-- A deleted capture keeps its row with deleted_at set. The select policy hides those rows from
-- everyone, so the grid, counts, calendar and cavitation_summary need no changes. Only an
-- org's Owner can delete, restore, list or purge them, always through the functions below
-- (security definer, owner checked inside), never with direct table writes.

alter table cavitation_captures add column deleted_at timestamptz;
create index idx_cavitation_deleted on cavitation_captures(plant_id, deleted_at) where deleted_at is not null;

drop policy select_cavitation_in_scope on cavitation_captures;
create policy select_cavitation_in_scope on cavitation_captures for select
  using (
    deleted_at is null
    and plant_id in (
      select id from plants
      where is_demo_org(org_id) or is_org_member(org_id)
    )
  );

-- Direct deletes are replaced by purge_captures() below.
drop policy delete_cavitation_as_owner on cavitation_captures;
revoke delete on cavitation_captures from authenticated;

-- Hide: by id, or everything matching a time range for one plant (the flood case, one statement).
-- Both return {count, at}; every row hidden by one call shares `at`, which is how Undo finds them.
create or replace function soft_delete_captures(ids bigint[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; stamp timestamptz := now();
begin
  update cavitation_captures c set deleted_at = stamp
  where c.id = any(ids) and c.deleted_at is null
    and c.plant_id in (select p.id from plants p where is_org_owner(p.org_id));
  get diagnostics n = row_count;
  return jsonb_build_object('count', n, 'at', stamp);
end $$;

create or replace function soft_delete_captures_matching(
  target_plant uuid, from_ts timestamptz default null, to_ts timestamptz default null, include_flagged boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; stamp timestamptz := now();
begin
  update cavitation_captures c set deleted_at = stamp
  where c.plant_id = target_plant and c.deleted_at is null
    and c.plant_id in (select p.id from plants p where is_org_owner(p.org_id))
    and (from_ts is null or c.ts >= from_ts) and (to_ts is null or c.ts <= to_ts)
    and (include_flagged or not c.flagged);
  get diagnostics n = row_count;
  return jsonb_build_object('count', n, 'at', stamp);
end $$;

-- Bring back: everything hidden by one delete (`at`), specific ids, or all of a plant's.
create or replace function restore_captures(target_plant uuid, ids bigint[] default null, at_ts timestamptz default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update cavitation_captures c set deleted_at = null
  where c.plant_id = target_plant and c.deleted_at is not null
    and c.plant_id in (select p.id from plants p where is_org_owner(p.org_id))
    and (ids is null or c.id = any(ids)) and (at_ts is null or c.deleted_at = at_ts);
  get diagnostics n = row_count;
  return n;
end $$;

-- What is currently hidden, newest deletion first. `total` is the full count past max_rows.
create or replace function list_deleted_captures(target_plant uuid, max_rows int default 200)
returns table(id bigint, ts timestamptz, cls text, peak_mv real, flagged boolean, deleted_at timestamptz, total bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.ts, c.cls, c.peak_mv, c.flagged, c.deleted_at, count(*) over () as total
  from cavitation_captures c
  where c.plant_id = target_plant and c.deleted_at is not null
    and c.plant_id in (select p.id from plants p where is_org_owner(p.org_id))
  order by c.deleted_at desc, c.ts desc
  limit max_rows;
$$;

-- Remove for good: given ids, everything hidden for the plant, or only what has passed the 24h
-- hold. Returns the waveform file paths so the app can delete those from Storage (SQL cannot).
create or replace function purge_captures(target_plant uuid, ids bigint[] default null, only_expired boolean default false)
returns table(full_path text) language plpgsql security definer set search_path = public as $$
begin
  return query
    with gone as (
      delete from cavitation_captures c
      where c.plant_id = target_plant and c.deleted_at is not null
        and c.plant_id in (select p.id from plants p where is_org_owner(p.org_id))
        and (ids is null or c.id = any(ids))
        and (not only_expired or c.deleted_at < now() - interval '24 hours')
      returning c.full_path
    )
    select g.full_path from gone g where g.full_path is not null;
end $$;

-- Supabase's default privileges also grant new functions to anon directly, so revoke it by name.
revoke all on function soft_delete_captures(bigint[]) from public, anon;
revoke all on function soft_delete_captures_matching(uuid, timestamptz, timestamptz, boolean) from public, anon;
revoke all on function restore_captures(uuid, bigint[], timestamptz) from public, anon;
revoke all on function list_deleted_captures(uuid, int) from public, anon;
revoke all on function purge_captures(uuid, bigint[], boolean) from public, anon;
grant execute on function soft_delete_captures(bigint[]) to authenticated;
grant execute on function soft_delete_captures_matching(uuid, timestamptz, timestamptz, boolean) to authenticated;
grant execute on function restore_captures(uuid, bigint[], timestamptz) to authenticated;
grant execute on function list_deleted_captures(uuid, int) to authenticated;
grant execute on function purge_captures(uuid, bigint[], boolean) to authenticated;
