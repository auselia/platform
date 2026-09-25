-- Firmware contract, section 3 (OTA): let an org's Owner upload a firmware .bin and roll it out
-- to that plant's device from the dashboard.
--
-- Setting a rollout target means pushing code to a physical device that may be far away, so:
--   * It is off for every device until Auselia turns it on (ota_enabled_plants, written only
--     with SQL/service role, never from the client). Owners of other devices cannot flash anything.
--   * Only an Owner of the plant's org can upload or roll out, and only through the functions
--     below; no client can write the tables directly. Editors and Viewers cannot.
--   * The binary embeds the device key and WiFi password, so the bucket is private and devices
--     download through a device-authenticated function (firmware-download), never a public URL.
--   * That function refuses to serve a file whose size or SHA-256 differs from what was
--     registered, or that does not start with the ESP image magic byte.
--   * Who uploaded and who rolled out, and when, is recorded.
-- Not covered: the device does not verify a signature on the image, and there is no automatic
-- rollback if a new image boots but cannot reach WiFi (recovery then needs a USB cable).

create table ota_enabled_plants (
  plant_id uuid primary key references plants(id) on delete cascade,
  enabled_at timestamptz not null default now(),
  note text
);

create table firmware_releases (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references plants(id) on delete cascade,
  version text not null check (version ~ '^[A-Za-z0-9._+-]{1,32}$'),
  storage_path text not null unique,
  size_bytes int not null check (size_bytes between 50000 and 3145728),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (plant_id, version)
);

-- What the device should be running. No row means "no update advertised".
create table firmware_target (
  plant_id uuid primary key references plants(id) on delete cascade,
  release_id uuid not null references firmware_releases(id) on delete cascade,
  set_by uuid not null references auth.users(id),
  set_at timestamptz not null default now()
);

alter table ota_enabled_plants enable row level security;
alter table firmware_releases enable row level security;
alter table firmware_target enable row level security;
create policy select_ota_enabled_as_owner on ota_enabled_plants for select
  using (plant_id in (select id from plants where is_org_owner(org_id)));
create policy select_firmware_releases_as_owner on firmware_releases for select
  using (plant_id in (select id from plants where is_org_owner(org_id)));
create policy select_firmware_target_as_owner on firmware_target for select
  using (plant_id in (select id from plants where is_org_owner(org_id)));
revoke all on ota_enabled_plants, firmware_releases, firmware_target from anon, authenticated;
grant select on ota_enabled_plants, firmware_releases, firmware_target to authenticated;

-- Private bucket; uploads go straight from the browser, but only into <plant_id>/ folders of
-- OTA-enabled plants the caller owns, and never overwrite (no upsert without an update policy).
insert into storage.buckets (id, name, public, file_size_limit)
values ('firmware', 'firmware', false, 3145728)
on conflict (id) do nothing;

create policy upload_firmware_as_owner on storage.objects for insert
  with check (
    bucket_id = 'firmware'
    and (storage.foldername(name))[1] in (
      select p.id::text from plants p join ota_enabled_plants o on o.plant_id = p.id
      where is_org_owner(p.org_id)
    )
  );

-- The Storage API has to be able to see an object before it will delete it, so owners get read
-- access to their own folder too (it is their own device's build).
create policy read_firmware_as_owner on storage.objects for select
  using (
    bucket_id = 'firmware'
    and (storage.foldername(name))[1] in (
      select p.id::text from plants p join ota_enabled_plants o on o.plant_id = p.id
      where is_org_owner(p.org_id)
    )
  );

-- So a failed registration can be cleaned up and the same version retried. Removing the file of
-- a release that is currently rolled out just makes firmware-download answer 502 (the device
-- keeps its current firmware), it cannot push anything.
create policy delete_firmware_as_owner on storage.objects for delete
  using (
    bucket_id = 'firmware'
    and (storage.foldername(name))[1] in (
      select p.id::text from plants p join ota_enabled_plants o on o.plant_id = p.id
      where is_org_owner(p.org_id)
    )
  );

create or replace function register_firmware(target_plant uuid, fw_version text, fw_path text, fw_size int, fw_sha256 text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare org uuid; rid uuid; stored_size int;
begin
  select p.org_id into org from plants p where p.id = target_plant;
  if org is null or not is_org_owner(org) then raise exception 'not_owner'; end if;
  if not exists (select 1 from ota_enabled_plants where plant_id = target_plant) then raise exception 'ota_not_enabled'; end if;
  if fw_path <> target_plant::text || '/' || fw_version || '.bin' then raise exception 'bad_path'; end if;

  select (o.metadata->>'size')::int into stored_size from storage.objects o where o.bucket_id = 'firmware' and o.name = fw_path;
  if stored_size is null then raise exception 'file_not_uploaded'; end if;
  if stored_size <> fw_size then raise exception 'size_mismatch'; end if;

  insert into firmware_releases (plant_id, version, storage_path, size_bytes, sha256, uploaded_by)
  values (target_plant, fw_version, fw_path, fw_size, lower(fw_sha256), auth.uid())
  returning id into rid;
  return rid;
end;
$$;

-- Roll out a release to the plant's device, or pass null to stop advertising an update.
create or replace function set_firmware_target(target_plant uuid, release uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare org uuid;
begin
  select p.org_id into org from plants p where p.id = target_plant;
  if org is null or not is_org_owner(org) then raise exception 'not_owner'; end if;
  if not exists (select 1 from ota_enabled_plants where plant_id = target_plant) then raise exception 'ota_not_enabled'; end if;

  if release is null then
    delete from firmware_target where plant_id = target_plant;
    return;
  end if;
  if not exists (select 1 from firmware_releases r where r.id = release and r.plant_id = target_plant) then
    raise exception 'unknown_release';
  end if;
  insert into firmware_target (plant_id, release_id, set_by, set_at)
  values (target_plant, release, auth.uid(), now())
  on conflict (plant_id) do update set release_id = excluded.release_id, set_by = excluded.set_by, set_at = now();
end;
$$;

revoke all on function register_firmware(uuid, text, text, int, text) from public, anon;
revoke all on function set_firmware_target(uuid, uuid) from public, anon;
grant execute on function register_firmware(uuid, text, text, int, text) to authenticated;
grant execute on function set_firmware_target(uuid, uuid) to authenticated;
