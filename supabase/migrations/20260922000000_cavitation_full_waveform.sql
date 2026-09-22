-- Full-resolution waveform for each capture, for the analysis dialog (zoom, FFT, export).
-- The samples live in a private Storage bucket as gzip of the raw ADC counts (little endian).
-- `scale` holds what the browser needs to turn counts into volts and seconds.
--
--   volts = (raw - yref) * yinc + yorig
--   time  = (index - xref) * xinc + xorig      (seconds, 0 = the trigger)
--   scale = {"dtype":"u2"|"u1","n":62500,"xinc":..,"xorig":..,"xref":..,"yinc":..,"yorig":..,"yref":..}

alter table cavitation_captures
  add column full_path text,
  add column scale jsonb;

-- Storage writes only happen in the Edge Function (service role). The client may only read.
insert into storage.buckets (id, name, public, file_size_limit)
values ('cavitation-full', 'cavitation-full', false, 2097152)
on conflict (id) do nothing;

-- Object path is <plant_id>/<capture_key>.bin.gz, so the first folder is the plant.
create policy read_cavitation_full_in_scope on storage.objects for select
  using (
    bucket_id = 'cavitation-full'
    and (storage.foldername(name))[1] in (
      select id::text from plants
      where is_demo_org(org_id) or is_org_member(org_id)
    )
  );
