-- Cavitation captures from the oscilloscope logger (cavitation_logger).
-- One row per saved waveform. The full-resolution file stays on the lab PC.
-- Here we keep the metrics and a min/max-decimated trace (about 1200 points,
-- integers in units of 0.1 mV) so the dashboard can draw it.
--
-- Rows arrive only through the cavitation-ingest Edge Function (service role).
-- Members can read them and can change only the flag columns.

create table cavitation_captures (
  id bigint generated always as identity primary key,
  plant_id uuid not null references plants(id) on delete cascade,
  capture_key text not null,            -- YYYYMMDD_HHMMSS_mmm_chN_NNNNN, unique per plant
  ts timestamptz not null,
  ch smallint not null default 1,
  cls text not null check (cls in ('burst', 'spike', 'weak', 'other')),
  level_mv real,
  peak_mv real,
  snr real,
  dur_us real,
  swings int,
  freq_khz real,
  sigma_mv real,
  vpp_mv real,
  clipped boolean not null default false,
  t0_us real not null,                  -- first sample time, relative to the trigger
  t1_us real not null,                  -- last sample time
  ev0_us real,                          -- detected event start, null if none
  ev1_us real,
  y int[] not null,                     -- trace in 0.1 mV, evenly spread from t0_us to t1_us
  flagged boolean not null default false,
  flag_note text not null default '' check (char_length(flag_note) <= 300),
  flagged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plant_id, capture_key)
);
create index idx_cavitation_plant_ts on cavitation_captures(plant_id, ts desc);
create index idx_cavitation_flagged on cavitation_captures(plant_id, ts desc) where flagged;

alter table cavitation_captures enable row level security;

create policy select_cavitation_in_scope on cavitation_captures for select
  using (
    plant_id in (
      select id from plants
      where is_demo_org(org_id) or is_org_member(org_id)
    )
  );

-- Members may flag and annotate. Nothing else is writable from the client.
create policy update_cavitation_flags_as_member on cavitation_captures for update
  using (plant_id in (select id from plants where is_org_member(org_id)))
  with check (plant_id in (select id from plants where is_org_member(org_id)));

revoke insert, update, delete on cavitation_captures from anon, authenticated;
grant update (flagged, flag_note, flagged_at) on cavitation_captures to authenticated;

-- Per-plant summary for the dashboard header: counts and freshness without
-- shipping any trace data.
create view cavitation_summary with (security_invoker = true) as
select
  plant_id,
  count(*)                                                as total,
  count(*) filter (where ts > now() - interval '24 hours') as last_24h,
  count(*) filter (where ts > now() - interval '7 days')   as last_7d,
  count(*) filter (where flagged)                          as flagged,
  max(ts)                                                  as last_capture_at
from cavitation_captures
group by plant_id;
