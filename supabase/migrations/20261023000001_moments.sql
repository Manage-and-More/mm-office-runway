-- Moments: things members want to celebrate ("5 lecture visits", "organised the retreat").
-- Donations stay in payments (they move the runway); a moment only moves the mood.
-- Members read all moments (name tags, recap); each person writes their own; admins may delete any.
-- There is no public view: the anonymous page sees no moments at all.

create table public.moments (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null check (owner_email = lower(owner_email) and owner_email like '%@%'),
  emoji text not null default '🎉' check (char_length(emoji) between 1 and 8),
  text text not null check (char_length(btrim(text)) between 1 and 80),
  happened_on date not null default current_date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.moments is 'Members'' highlights, one line each. Never public; donations are in payments.';
create index moments_owner_email on public.moments (owner_email, happened_on desc);

create trigger set_audit_columns before insert or update on public.moments for each row execute function public.set_audit_columns();

alter table public.moments enable row level security;
revoke all on public.moments from anon, authenticated;
grant select, insert, update, delete on public.moments to authenticated;

create policy "editors read moments"      on public.moments for select to authenticated using (public.is_editor());
create policy "own moment: insert"        on public.moments for insert to authenticated with check (owner_email = public.current_email());
create policy "own moment: update"        on public.moments for update to authenticated using (owner_email = public.current_email()) with check (owner_email = public.current_email());
create policy "own moment or admin: delete" on public.moments for delete to authenticated using (owner_email = public.current_email() or public.is_admin());
