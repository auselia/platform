-- The demo org's Cavitations tab (added this pass, see tab-shell.tsx) had nothing to show:
-- real cavitation_captures rows only ever come from the oscilloscope logger listening to the
-- one real "Hope" plant, never from anything in the demo org. This generates a synthetic
-- capture history per demo plant, over the same ~31 day window seed_demo_history.sql already
-- built for readings, so the demo actually showcases the feature instead of an empty state.
--
-- Capture frequency and class mix scale with how dry each plant's seeded readings already
-- are (lower average soil_pct -> more, and more "burst"-class, captures), so the two seeded
-- datasets tell a consistent story instead of two unrelated random ones. Purely additive and
-- demo-only: it never touches a real plant, and RLS already lets is_demo_org reads through
-- (see cavitation_captures.sql), so this is only a data gap, not a policy one.

do $$
declare
  demo_org_id uuid := '00000000-0000-0000-0000-000000000001';
  p record;
  avg_soil numeric;
  stress numeric;             -- 0 (well watered) .. 1 (very dry)
  gap_hours numeric;          -- average hours between captures for this plant
  ts timestamptz;
  window_end timestamptz := now();
  window_start timestamptz := date_trunc('day', now()) - interval '30 days';
  counter int;
  roll numeric;
  cls text;
  peak numeric; freq numeric; dur numeric; swings_n int; sigma numeric; level numeric; vpp numeric;
  t0 numeric; t1 numeric; ev0 numeric; ev1 numeric;
  n int := 240;
  key text;
begin
  for p in select id from plants where org_id = demo_org_id loop
    select avg(soil_pct) into avg_soil from readings where plant_id = p.id;
    stress := greatest(0, least(1, (70 - coalesce(avg_soil, 55)) / 50));
    gap_hours := 40 - stress * 32;

    ts := window_start + (random() * gap_hours || ' hours')::interval;
    counter := 0;
    while ts < window_end loop
      counter := counter + 1;
      roll := random();
      if roll < 0.15 + stress * 0.5 then
        cls := 'burst';
        peak := 3 + random() * 12 + stress * 4;
        freq := 80 + random() * 170;
        dur := 80 + random() * 220;
      elsif roll < 0.30 + stress * 0.5 then
        cls := 'spike';
        peak := 2 + random() * 6;
        freq := 150 + random() * 350;
        dur := 15 + random() * 35;
      elsif roll < 0.85 - stress * 0.35 then
        cls := 'weak';
        peak := 0.3 + random() * 1.7;
        freq := 50 + random() * 150;
        dur := 40 + random() * 110;
      else
        cls := 'other';
        peak := 0.5 + random() * 3.5;
        freq := 50 + random() * 350;
        dur := 30 + random() * 170;
      end if;

      swings_n := greatest(3, round(dur * freq / 1000));
      sigma := 0.04 + random() * 0.12;
      level := round((peak * (0.5 + random() * 0.25))::numeric, 3);
      vpp := round((peak * (1.6 + random() * 0.4))::numeric, 3);
      t0 := -20;
      t1 := t0 + dur * 4;
      ev0 := 0;
      ev1 := dur;
      key := to_char(ts, 'YYYYMMDD_HH24MISS') || '_' || lpad((floor(random() * 999))::int::text, 3, '0')
        || '_ch1_' || lpad(counter::text, 5, '0');

      insert into cavitation_captures (
        plant_id, capture_key, ts, ch, cls, level_mv, peak_mv, snr, dur_us, swings, freq_khz,
        sigma_mv, vpp_mv, clipped, t0_us, t1_us, ev0_us, ev1_us, y
      ) values (
        p.id, key, ts, 1, cls,
        level, round(peak::numeric, 3), round((peak / sigma)::numeric, 2), round(dur::numeric, 1),
        swings_n, round(freq::numeric, 2), round(sigma::numeric, 4), vpp, false,
        t0, t1, ev0, ev1,
        array(
          select round((
            case when (t0 + (i::numeric / (n - 1)) * (t1 - t0)) < ev0
              then (random() - 0.5) * sigma * 2
              else peak * exp(-((t0 + (i::numeric / (n - 1)) * (t1 - t0)) - ev0) / (dur / 3))
                   * sin(2 * pi() * freq * 1000 * ((t0 + (i::numeric / (n - 1)) * (t1 - t0)) - ev0) / 1e6)
                   + (random() - 0.5) * sigma
            end
          ) * 10)::int
          from generate_series(0, n - 1) as i
        )
      );

      ts := ts + (gap_hours * (0.6 + random() * 0.8) || ' hours')::interval;
    end loop;
  end loop;
end $$;
