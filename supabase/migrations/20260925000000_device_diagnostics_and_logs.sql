-- Firmware contract, sections 1 and 2 (hope_xylem/firmware/CONTRACT.md).
--
-- 1. Diagnostics that ride along on each hourly reading. All nullable: a missing value
--    means "not available this cycle", and older firmware sends none of them.
-- 2. Device log events: the firmware buffers named lifecycle events and problems (pump on/off,
--    sensor dropped out, OTA result) and flushes them in batches. This is not a live tail.

alter table readings
  add column soil_raw int,        -- raw ADC count behind soil_pct: tells a probe fault from a calibration issue
  add column wifi_rssi int,       -- dBm at upload time
  add column free_heap bigint,    -- bytes; a downward trend points at a firmware memory problem
  add column uptime_ms bigint;    -- millis() since boot; a small value next to a reading means a recent reboot

create table device_logs (
  id bigint generated always as identity primary key,
  plant_id uuid not null references plants(id) on delete cascade,
  -- Device millis(), not a wall clock: early-boot warnings can be logged before NTP has synced.
  -- created_at is when the batch arrived, so roughly when it happened, up to one poll late.
  uptime_ms bigint not null check (uptime_ms >= 0),
  level text not null check (level in ('event', 'warning', 'error')),
  message text not null check (char_length(message) between 1 and 300),
  created_at timestamptz not null default now()
);
create index idx_device_logs_plant_created on device_logs(plant_id, created_at desc);

alter table device_logs enable row level security;
-- Any member can read (a Viewer can see what the device is doing); nobody writes from the client.
create policy select_device_logs_as_member on device_logs for select
  using (plant_id in (select id from plants where is_org_member(org_id)));
revoke all on device_logs from anon, authenticated;
grant select on device_logs to authenticated;

-- Insert a batch and trim in the same call. Only the device-logs Edge Function (service role)
-- can run it. Retention: 30 days and at most 5000 rows per plant, so a firmware bug that logs
-- in a loop cannot grow the table without bound.
create or replace function append_device_logs(target_plant uuid, events jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int; cutoff bigint;
begin
  if jsonb_typeof(events) <> 'array' then
    raise exception 'events_must_be_array';
  end if;

  insert into device_logs (plant_id, uptime_ms, level, message)
  select target_plant, (e->>'uptime_ms')::bigint, e->>'level', left(e->>'message', 300)
  from jsonb_array_elements(events) e
  where e->>'level' in ('event', 'warning', 'error')
    and (e->>'uptime_ms') ~ '^[0-9]{1,15}$'
    and length(coalesce(e->>'message', '')) > 0;
  get diagnostics n = row_count;

  select id into cutoff from device_logs where plant_id = target_plant order by id desc offset 5000 limit 1;
  delete from device_logs
  where plant_id = target_plant and (created_at < now() - interval '30 days' or id <= coalesce(cutoff, 0));

  return n;
end;
$$;
revoke all on function append_device_logs(uuid, jsonb) from public, anon, authenticated;
grant execute on function append_device_logs(uuid, jsonb) to service_role;
