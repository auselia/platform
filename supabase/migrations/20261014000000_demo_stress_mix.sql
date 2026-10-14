-- Gives the demo org a realistic mix of statuses on its latest readings.
--
-- A cuartel's status is its most recent soil reading only (< 20 critical, < 40 elevated), and the
-- seed happened to leave all 14 cuarteles healthy on the last day, so the demo showed no stress at
-- all even though several had dipped earlier in the month. This bends the final 48 hours of five
-- cuarteles toward a dry-down: two critical, three elevated, nine untouched.
--
-- Each affected reading keeps its own noise and only has a growing offset subtracted, so the curve
-- is continuous with the 48 hour mark and lands exactly on the target at the last reading. Humidity
-- and pot weight dry down with the soil so the other charts tell the same story.
--
-- Idempotent: the offset is measured from each plant's last soil value, so once a plant is at its
-- target a second run subtracts nothing. Only the demo org's rows are touched.

do $$
declare
  demo_org_id uuid := '00000000-0000-0000-0000-000000000001';
  t record;
  pid uuid;
  last_ts timestamptz;
  anchor numeric;
  drop_pct numeric;
begin
  for t in
    select * from (values
      ('Cuartel 3', 14.2),   -- critical
      ('Cuartel 8', 17.6),   -- critical
      ('Cuartel 4', 29.8),   -- elevated
      ('Cuartel 6', 32.6),   -- elevated
      ('Cuartel 1', 35.3)    -- elevated
    ) as v(plant_name, target)
  loop
    select id into pid from plants where org_id = demo_org_id and name = t.plant_name;
    continue when pid is null;

    select ts, soil_pct into last_ts, anchor
    from readings where plant_id = pid and soil_pct is not null
    order by ts desc limit 1;
    continue when last_ts is null or anchor <= t.target;

    drop_pct := anchor - t.target;

    update readings r
    set soil_pct     = greatest(0, round((r.soil_pct - drop_pct * w.ease)::numeric, 1)),
        humidity_pct = case when r.humidity_pct is null then null
                            else greatest(0, round((r.humidity_pct - drop_pct * 0.55 * w.ease)::numeric, 1)) end,
        weight_g     = case when r.weight_g is null then null
                            else greatest(0, round((r.weight_g - drop_pct * 11 * w.ease)::numeric, 0)) end
    from (
      select id,
             -- 0 at the start of the window, 1 at the last reading; eased so the drying accelerates
             power(extract(epoch from (ts - (last_ts - interval '48 hours'))) / (48 * 3600), 1.6) as ease
      from readings
      where plant_id = pid and ts > last_ts - interval '48 hours' and ts <= last_ts
    ) w
    where r.id = w.id;
  end loop;
end $$;
