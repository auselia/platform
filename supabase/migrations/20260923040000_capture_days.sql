-- Which calendar days have cavitation captures for a plant, in the caller's time zone.
-- The Stress events day picker needs this: captures and hourly readings live on different
-- days (a lab oscilloscope can have weeks of captures while the pot has one day of readings).
-- A function rather than a client-side query because PostgREST caps a response at 1000 rows,
-- which one busy day of captures can exceed. Security invoker, so the existing RLS on
-- cavitation_captures still decides what the caller can see (members and the public demo).

create or replace function capture_days(target_plant uuid, tz text default 'UTC')
returns table(day date)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct (ts at time zone tz)::date as day
  from cavitation_captures
  where plant_id = target_plant
  order by day desc;
$$;

grant execute on function capture_days(uuid, text) to anon, authenticated;
