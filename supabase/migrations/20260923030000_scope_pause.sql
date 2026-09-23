-- Pause and resume the logger from the dashboard. Two more command kinds. The lab PC stops the
-- logger with its own clean stop (scope back to Run, nothing captured) and starts it again on resume.

alter table scope_commands drop constraint scope_commands_kind_check;
alter table scope_commands add constraint scope_commands_kind_check
  check (kind in ('settings_apply', 'snapshot_save', 'snapshot_apply', 'snapshot_delete', 'guard', 'logger_pause', 'logger_resume'));
