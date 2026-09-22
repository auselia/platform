-- The demo org only had one day of readings (seed_demo_org.sql), so Week and Month range
-- views and the focus-mode day picker had nothing to browse. Adds about a month of history
-- per plant before that day, on a repeating irrigation cycle (moisture and pot weight climb
-- at each "irrigation", then decay until the next one), so the calendar has many marked days
-- and week/month averages actually move. Purely additive: it only inserts older rows, so the
-- most recent reading per plant (and therefore its status/map colour) is unchanged.

do $$
declare
  demo_org_id uuid := '00000000-0000-0000-0000-000000000001';
  p record;
  status text;
  roll numeric;
  irr_period int;              -- days between irrigations
  moist_hi numeric;            -- soil moisture right after an irrigation
  moist_drop numeric;          -- moisture lost over one full irrigation cycle
  hum_hi numeric;
  hum_drop numeric;
  weight_hi numeric;
  weight_drop numeric;
  trend numeric;               -- slow drift per day across the whole month
  day_back int;
  step int;
  h int;
  cyc numeric;                 -- 0 (just irrigated) .. ~1 (about to be irrigated again)
  ts timestamptz;
  moist numeric;
  hum numeric;
  wt numeric;
begin
  for p in select id from plants where org_id = demo_org_id loop
    roll := random();
    status := case
      when roll < 0.10 then 'critical'
      when roll < 0.28 then 'warning'
      else 'good'
    end;

    irr_period := case
      when status = 'critical' then 6 + (random() * 3)::int
      when status = 'warning' then 4 + (random() * 2)::int
      else 3 + (random() * 2)::int
    end;
    moist_hi := 58 + random() * 10;
    hum_hi := 58 + random() * 8;
    weight_hi := 3 + random() * 0.4;
    moist_drop := case
      when status = 'critical' then 32 + random() * 14
      when status = 'warning' then 14 + random() * 10
      else 4 + random() * 8
    end;
    hum_drop := moist_drop * (0.55 + random() * 0.25);
    weight_drop := case
      when status = 'critical' then 0.5 + random() * 0.35
      when status = 'warning' then 0.2 + random() * 0.18
      else 0.03 + random() * 0.12
    end;
    trend := case
      when status = 'critical' then -(0.4 + random() * 0.5)
      when status = 'warning' then -(0.08 + random() * 0.12)
      else (random() - 0.35) * 0.06
    end;

    -- 30 days back, ending the day before the existing 24h seed. Hourly for the closest
    -- week (so a "day" view still has 24 points), every 3 hours before that.
    for day_back in 1..30 loop
      step := case when day_back <= 7 then 1 else 3 end;
      for h in 0..23 by step loop
        cyc := (day_back % irr_period)::numeric / irr_period;
        ts := date_trunc('day', now()) - (day_back || ' days')::interval + (h || ' hours')::interval;
        moist := greatest(2, moist_hi - cyc * moist_drop + trend * day_back + sin(h / 24.0 * 6.283) * 1.2 + (random() - 0.5) * 2.2);
        hum := greatest(0, hum_hi - cyc * hum_drop + sin((h + 6) / 24.0 * 6.283) * 4 + (random() - 0.5) * 3);
        wt := greatest(0.2, weight_hi - cyc * weight_drop + trend * day_back * 0.01 + (random() - 0.5) * 0.03);
        insert into readings (plant_id, ts, soil_pct, root_temp_c, air_temp_c, humidity_pct, pressure_hpa, weight_g)
        values (
          p.id, ts,
          round(moist::numeric, 1),
          round((14 + moist * 0.1 + sin(h / 24.0 * 6.283) * 1.2 + (random() - 0.5) * 0.5)::numeric, 1),
          round((16 + sin((h - 9) / 24.0 * 6.283) * 7 + (random() - 0.5) * 0.8)::numeric, 1),
          round(hum::numeric, 1),
          round((1013 + sin(day_back / 5.0) * 4 + (random() - 0.5) * 1.5)::numeric, 1),
          round((wt * 1000)::numeric, 0)
        );
      end loop;
    end loop;
  end loop;
end $$;
