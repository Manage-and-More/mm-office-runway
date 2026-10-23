-- Admins may add moments and donations for members who haven't signed up yet. The member is
-- identified by their MM email; a Mii is created for them on the spot (random look, no name,
-- marked unclaimed) so their moments have a figure on the page. Signing up later with the same
-- email makes it theirs: one email, one person, no duplicates.

alter table public.avatars add column claimed boolean not null default true;
comment on column public.avatars.claimed is 'false while an admin-created Mii waits for its owner to sign in and make it theirs.';

-- Moments: own, or any member's when you are an admin (insert and update; delete already allowed admins).
drop policy "own moment: insert" on public.moments;
create policy "own moment or admin: insert" on public.moments
  for insert to authenticated
  with check (owner_email = public.current_email() or public.is_admin());
drop policy "own moment: update" on public.moments;
create policy "own moment or admin: update" on public.moments
  for update to authenticated
  using (owner_email = public.current_email() or public.is_admin())
  with check (owner_email = public.current_email() or public.is_admin());

-- Both tables: the owner email must be on an allowed domain, so a typo can't create a ghost person.
create or replace function public.require_allowed_owner_domain()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.allowed_email_domains d where d.domain = split_part(new.owner_email, '@', 2)) then
    raise exception 'Only Manage and More addresses can own a Mii or a moment (got %)', new.owner_email
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger require_allowed_owner_domain before insert or update on public.avatars for each row execute function public.require_allowed_owner_domain();
create trigger require_allowed_owner_domain before insert or update on public.moments for each row execute function public.require_allowed_owner_domain();
