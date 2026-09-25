-- Firmware contract, section 3: a dashboard-driven manual pump toggle, independent of the
-- schedule. The device compares manual_command_at against the last one it acted on, so the
-- timestamp must change exactly when manual_pump_on changes and must come from the server, not
-- from a client clock.
--
-- The irrigation-config function only serves "on" while the command is fresh (6 minutes): the
-- firmware keeps its last command in RAM only, so after a reboot it would treat a stale "on"
-- as new and start the pump.

alter table irrigation_config
  add column manual_pump_on boolean not null default false,
  add column manual_command_at timestamptz;

create or replace function stamp_manual_command()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.manual_command_at := case when new.manual_pump_on then now() else null end;
  elsif new.manual_pump_on is distinct from old.manual_pump_on then
    new.manual_command_at := now();
  else
    new.manual_command_at := old.manual_command_at;
  end if;
  return new;
end;
$$;

create trigger irrigation_config_stamp_manual
  before insert or update on irrigation_config
  for each row execute function stamp_manual_command();
