-- The contact form used to insert straight into contact_submissions with a policy that let
-- anon do it (`with check (true)`). The anon key is public, so anyone could bypass the site
-- and fill the table (or, through the action, trigger emails) without limit.
--
-- Now the only way in is submit_contact(), which validates and rate-limits, and returns
-- whether the message was stored. Direct inserts are revoked.

drop policy insert_contact_as_anyone on contact_submissions;
revoke insert on contact_submissions from anon, authenticated;

create or replace function submit_contact(
  p_name text, p_email text, p_org_name text, p_message text, p_lang text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 200
     or char_length(btrim(coalesce(p_message, ''))) not between 1 and 4000
     or char_length(coalesce(p_org_name, '')) > 200
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or char_length(v_email) > 320 then
    return 'invalid';
  end if;

  -- Global ceiling, and a per-address ceiling, per hour.
  if (select count(*) from contact_submissions where created_at > now() - interval '1 hour') >= 30
     or (select count(*) from contact_submissions
         where lower(email) = v_email and created_at > now() - interval '1 hour') >= 3 then
    return 'rate_limited';
  end if;

  insert into contact_submissions (name, email, org_name, message, lang)
  values (btrim(p_name), v_email, coalesce(p_org_name, ''), btrim(p_message),
          case when p_lang in ('en', 'es') then p_lang else 'en' end);
  return 'ok';
end;
$$;

revoke all on function submit_contact(text, text, text, text, text) from public;
grant execute on function submit_contact(text, text, text, text, text) to anon, authenticated;

create index if not exists idx_contact_submissions_email_created
  on contact_submissions (lower(email), created_at desc);
