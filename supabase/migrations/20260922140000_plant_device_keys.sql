-- Device identity used to live as one api_key_hash column on plants (one key per plant,
-- enforced by a unique index). That broke down for "Hope": the ESP32 (soil/environment
-- readings) and the oscilloscope logger (cavitation captures) are two separate physical
-- devices that both belong to the same real plant, so a second "Hope ADC" plant row existed
-- purely to give the oscilloscope somewhere to authenticate as - an implementation detail
-- that leaked into the app as a second, fake plant. This lets one plant have more than one
-- device key instead.
--
-- Only ever read by authenticateDevice() (supabase/functions/_shared/device.ts) using the
-- service-role client, which bypasses RLS entirely - RLS here is a second layer, not the
-- gate, so anon/authenticated get no access at all rather than a narrowed one.

create table plant_device_keys (
  id bigint generated always as identity primary key,
  plant_id uuid not null references plants(id) on delete cascade,
  key_hash text not null,
  label text not null default '',
  created_at timestamptz not null default now(),
  unique (key_hash)
);

alter table plant_device_keys enable row level security;
revoke all on plant_device_keys from anon, authenticated;

-- Backfill: every plant's existing single key becomes its "primary" device key.
insert into plant_device_keys (plant_id, key_hash, label)
select id, api_key_hash, 'primary' from plants;

-- Hope ADC's oscilloscope key keeps working exactly as sent today (this moves the stored
-- hash, not the plaintext - nothing changes on the lab PC) - it just resolves to Hope now.
-- By name rather than a hardcoded id: dev and prod assigned "Hope ADC" a different plant id
-- (Hope itself happens to share one), and this stays a no-op if it's already been merged.
do $$
declare
  hope_id uuid;
  adc_id uuid;
begin
  select id into hope_id from plants where name = 'Hope';
  select id into adc_id from plants where name = 'Hope ADC';
  if adc_id is not null then
    update plant_device_keys set plant_id = hope_id, label = 'oscilloscope' where plant_id = adc_id;
    -- Move the real capture history onto Hope, then remove the now-empty Hope ADC plant.
    -- (plant_ingest_status is a computed view over plants/readings, not a table - it has
    -- nothing of its own to clean up, it just stops showing Hope ADC once the row is gone.)
    update cavitation_captures set plant_id = hope_id where plant_id = adc_id;
    delete from plants where id = adc_id;
  end if;
end $$;
