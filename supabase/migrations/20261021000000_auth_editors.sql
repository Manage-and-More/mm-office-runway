-- Authentication and authorisation for the admin page (MAN-72).
--
-- Three kinds of people:
--   public   anyone on the website, no login: reads the two public views, nothing else
--   editor   anyone signed in with a confirmed Manage and More account: may change runway data
--   admin    editors listed in public.admins: may also manage that list and the allowed domains
--
-- Who can sign in is enforced inside the database: the trigger below rejects any new account whose
-- email domain is not in public.allowed_email_domains. Every write policy on every table calls
-- is_editor(). Anonymous visitors never get any policy on the tables.

-- ───────────────────────────── allowed sign-in domains ─────────────────────────────

create table public.allowed_email_domains (
  domain text primary key check (domain = lower(domain) and domain <> ''),
  note text
);
comment on table public.allowed_email_domains is
  'Only accounts on these domains may sign up. Managed by admins, not code.';

alter table public.allowed_email_domains enable row level security;
revoke all on public.allowed_email_domains from anon, authenticated;

-- ───────────────────────────── admins ─────────────────────────────

create table public.admins (
  email text primary key check (email = lower(email) and email like '%@%'),
  added_by text,
  added_at timestamptz not null default now()
);
comment on table public.admins is
  'Who may manage admins and allowed domains. Keyed by email so people can be listed before their first sign-in. '
  'Everyone else who signs in is an editor automatically.';

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select, insert, delete on public.admins to authenticated;

-- ───────────────────────────── helpers used by RLS ─────────────────────────────

create or replace function public.current_email()
returns text
language sql stable
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- Signed in with a confirmed MM account. The sign-up trigger guarantees the domain, and Supabase
-- only issues a session once the email is confirmed.
create or replace function public.is_editor()
returns boolean
language sql stable
set search_path = ''
as $$
  select auth.role() = 'authenticated' and public.current_email() <> '';
$$;

-- security definer: reads admins regardless of the caller's own policies.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_editor() and exists (select 1 from public.admins a where a.email = public.current_email());
$$;

revoke all on function public.current_email(), public.is_editor(), public.is_admin() from public;
grant execute on function public.current_email(), public.is_editor(), public.is_admin() to authenticated, anon;

-- ───────────────────────────── policies ─────────────────────────────

-- Every editor may see who the admins are (so the pages can show the right tools).
create policy "admins: editors read" on public.admins
  for select to authenticated
  using (public.is_editor());

-- Only admins change the list. An admin cannot remove themself, so the list can't end up empty.
create policy "admins: admins insert" on public.admins
  for insert to authenticated
  with check (public.is_admin());

create policy "admins: admins delete others" on public.admins
  for delete to authenticated
  using (public.is_admin() and email <> public.current_email());

grant select, insert, delete on public.allowed_email_domains to authenticated;

create policy "domains: editors read" on public.allowed_email_domains
  for select to authenticated
  using (public.is_editor());

create policy "domains: admins insert" on public.allowed_email_domains
  for insert to authenticated
  with check (public.is_admin());

create policy "domains: admins delete" on public.allowed_email_domains
  for delete to authenticated
  using (public.is_admin());

-- Record who added an admin.
create or replace function public.admins_set_added_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(new.email);
  new.added_by := coalesce(new.added_by, public.current_email());
  return new;
end;
$$;

create trigger admins_set_added_by
  before insert on public.admins
  for each row execute function public.admins_set_added_by();

-- ───────────────────────────── domain guard on sign-up ─────────────────────────────

-- An account outside the allowed domains cannot even become an auth user, whatever the sign-in method.
create or replace function public.reject_foreign_email_domains()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  dom text := lower(split_part(coalesce(new.email, ''), '@', 2));
begin
  if dom = '' or not exists (select 1 from public.allowed_email_domains d where d.domain = dom) then
    raise exception 'Sign-in is limited to Manage and More accounts (got %)', coalesce(new.email, '<no email>')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger reject_foreign_email_domains
  before insert on auth.users
  for each row execute function public.reject_foreign_email_domains();
