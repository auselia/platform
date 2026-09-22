-- Submissions from the public marketing site's /contact form. Not org-scoped:
-- these come from anonymous visitors before they have any relationship to an
-- organization. Anyone can insert one; nobody can read, update or delete one
-- through the anon/authenticated roles, only through the service role (the
-- Management API for now, until there's an admin view for this).

create table contact_submissions (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  org_name text not null default '' check (char_length(org_name) <= 200),
  message text not null check (char_length(message) between 1 and 4000),
  lang text not null default 'en' check (lang in ('en', 'es')),
  created_at timestamptz not null default now()
);
create index idx_contact_submissions_created on contact_submissions(created_at desc);

alter table contact_submissions enable row level security;

create policy insert_contact_as_anyone on contact_submissions for insert
  to anon, authenticated with check (true);

revoke select, update, delete on contact_submissions from anon, authenticated;
