-- Runway on the shared M&M platform (mm-platform, schema "runway", browser lane). This one file is
-- the whole schema; it replaces supabase/migrations/* from the runway's own Supabase project
-- (see git history). Applied by `npm run db:migrate` as role runway_app, which owns this schema.
--
-- Three kinds of people:
--   public   anyone on the website, no login: reads the two public views, nothing else
--   editor   signed in with an account the platform allows (platform.is_email_allowed): may change runway data
--   admin    editors listed in runway.admins: may also manage that list
--
-- Who may sign in at all is the platform's job (allowed domains, one sign-in for every M&M app).
-- Every write policy calls is_editor(), which asks the platform on every request, so a domain the
-- platform blocks loses access here too. Anonymous visitors never get a policy on a table.
--
-- The funds rule, in one place (view public_runway):
--   funds = latest opening balance
--         + payments entered after that balance was recorded (and not dated in the future)
--         − months elapsed since the balance date × current monthly cost

-- ───────────────────────────── helpers used by RLS ─────────────────────────────

-- The signed-in person's email from the Data API's JWT ('' when anonymous).
create function runway.current_email()
returns text
language sql stable
set search_path = ''
as $$
  select lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', ''));
$$;

-- Signed in, and the platform still allows this address. security definer: only runway_app may ask
-- the platform; the Data API roles can't (and needn't) see it.
create function runway.is_editor()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'authenticated'
     and runway.current_email() <> ''
     and platform.is_email_allowed(runway.current_email());
$$;

create table runway.admins (
  email text primary key check (email = lower(email) and email like '%@%'),
  added_by text,
  added_at timestamptz not null default now()
);
comment on table runway.admins is
  'Who may edit and delete everything on /admin/ and manage this list. Keyed by email so people can be '
  'listed before their first sign-in. Everyone else who signs in is an editor automatically.';

-- security definer: reads admins regardless of the caller's own policies.
create function runway.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select runway.is_editor() and exists (select 1 from runway.admins a where a.email = runway.current_email());
$$;

revoke all on function runway.current_email(), runway.is_editor(), runway.is_admin() from public;
grant execute on function runway.current_email(), runway.is_editor(), runway.is_admin() to authenticated, anon;

-- ───────────────────────────── admins ─────────────────────────────

alter table runway.admins enable row level security;
grant select, insert, delete on runway.admins to authenticated;

-- Every editor may see who the admins are (so the pages can show the right tools).
create policy "admins: editors read" on runway.admins
  for select to authenticated
  using (runway.is_editor());

-- Only admins change the list. An admin cannot remove themself, so the list can't end up empty.
create policy "admins: admins insert" on runway.admins
  for insert to authenticated
  with check (runway.is_admin());

create policy "admins: admins delete others" on runway.admins
  for delete to authenticated
  using (runway.is_admin() and email <> runway.current_email());

create function runway.admins_set_added_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(new.email);
  new.added_by := coalesce(new.added_by, runway.current_email());
  return new;
end;
$$;

create trigger admins_set_added_by
  before insert on runway.admins
  for each row execute function runway.admins_set_added_by();

-- ───────────────────────────── shared helpers ─────────────────────────────

create function runway.set_audit_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, runway.current_email());
    new.created_at := coalesce(new.created_at, now());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- The owner of a Mii or a moment must be someone the platform allows, so a typo can't create a ghost person.
create function runway.require_allowed_owner()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not platform.is_email_allowed(new.owner_email) then
    raise exception 'Only Manage and More addresses can own a Mii or a moment (got %)', new.owner_email
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ───────────────────────────── monthly costs ─────────────────────────────

create table runway.monthly_costs (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 2) not null check (amount > 0),
  effective_from date not null unique,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table runway.monthly_costs is 'What the office costs per month, as a history. The row with the latest effective_from <= today applies.';

-- ───────────────────────────── opening balances ─────────────────────────────

create table runway.opening_balances (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 2) not null,
  as_of date not null unique,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table runway.opening_balances is 'Bank balance at a date, set when reconciling. Payments entered before this row was created are assumed to be included in it.';

-- ───────────────────────────── avatars ─────────────────────────────

-- The AvatarSpec contract (src/contracts/avatar.schema.json), kept here so the database validates
-- what the crowd will render. A contract change is a migration that updates this row.
create table runway.avatar_schema (
  id boolean primary key default true check (id), -- single row
  schema jsonb not null,
  updated_at timestamptz not null default now()
);

create table runway.avatars (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  spec jsonb not null check (spec ->> 'id' = id),
  -- The MM account this Mii belongs to: one Mii per person, edited by that person (or an admin).
  -- Never exposed to the public page (public_avatars returns spec only).
  owner_email text not null unique check (owner_email = lower(owner_email) and owner_email like '%@%'),
  claimed boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table runway.avatars is 'One Mii per MM account, parametric only (never photo-derived). Public only while spec.consent.public is true. Withdrawn consent = delete the row the same day.';
comment on column runway.avatars.claimed is 'false while an admin-created Mii waits for its owner to sign in and make it theirs.';

create function runway.validate_avatar_spec()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  s jsonb;
begin
  select schema into s from runway.avatar_schema limit 1;
  if s is null then
    raise exception 'avatar_schema is empty: apply the migration that inserts the AvatarSpec schema';
  end if;
  if not extensions.jsonb_matches_schema(s::json, new.spec) then
    raise exception 'AvatarSpec for "%" does not match src/contracts/avatar.schema.json', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger validate_avatar_spec
  before insert or update on runway.avatars
  for each row execute function runway.validate_avatar_spec();

-- ───────────────────────────── payments ─────────────────────────────

create table runway.payments (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 2) not null check (amount > 0),
  received_on date not null default current_date,
  kind text not null default 'donation' check (kind in ('donation', 'sponsorship', 'other')),
  payer_name text,
  donor_id text references runway.avatars (id) on delete set null,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table runway.payments is 'Every euro that comes in. Private: only editors see rows; the public page sees the sum via public_runway.';
create index payments_received_on on runway.payments (received_on);

-- ───────────────────────────── moments ─────────────────────────────

-- Things members want to celebrate ("5 lecture visits"). Donations stay in payments (they move the
-- runway); a moment only moves the mood. There is no public view: the anonymous page sees none.
create table runway.moments (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null check (owner_email = lower(owner_email) and owner_email like '%@%'),
  emoji text not null default '🎉' check (char_length(emoji) between 1 and 8),
  text text not null check (char_length(btrim(text)) between 1 and 80),
  happened_on date not null default current_date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table runway.moments is 'Members'' highlights, one line each. Never public; donations are in payments.';
create index moments_owner_email on runway.moments (owner_email, happened_on desc);

-- ───────────────────────────── triggers ─────────────────────────────

create trigger set_audit_columns before insert or update on runway.monthly_costs    for each row execute function runway.set_audit_columns();
create trigger set_audit_columns before insert or update on runway.opening_balances for each row execute function runway.set_audit_columns();
create trigger set_audit_columns before insert or update on runway.avatars          for each row execute function runway.set_audit_columns();
create trigger set_audit_columns before insert or update on runway.payments         for each row execute function runway.set_audit_columns();
create trigger set_audit_columns before insert or update on runway.moments          for each row execute function runway.set_audit_columns();
create trigger require_allowed_owner before insert or update on runway.avatars for each row execute function runway.require_allowed_owner();
create trigger require_allowed_owner before insert or update on runway.moments for each row execute function runway.require_allowed_owner();

-- ───────────────────────────── row level security ─────────────────────────────

alter table runway.monthly_costs    enable row level security;
alter table runway.opening_balances enable row level security;
alter table runway.avatars          enable row level security;
alter table runway.payments         enable row level security;
alter table runway.moments          enable row level security;
alter table runway.avatar_schema    enable row level security;

grant select, insert, update, delete on runway.monthly_costs, runway.opening_balances, runway.avatars, runway.payments, runway.moments to authenticated;
grant select on runway.avatar_schema to anon, authenticated;

create policy "editors manage monthly_costs"    on runway.monthly_costs    for all to authenticated using (runway.is_editor()) with check (runway.is_editor());
create policy "editors manage opening_balances" on runway.opening_balances for all to authenticated using (runway.is_editor()) with check (runway.is_editor());
create policy "editors manage payments"         on runway.payments         for all to authenticated using (runway.is_editor()) with check (runway.is_editor());
-- Every editor sees all Miis (for the name tags); each person writes only their own, admins any.
create policy "editors read avatars"            on runway.avatars          for select to authenticated using (runway.is_editor());
create policy "own Mii or admin: insert"        on runway.avatars          for insert to authenticated with check (runway.is_editor() and (owner_email = runway.current_email() or runway.is_admin()));
create policy "own Mii or admin: update"        on runway.avatars          for update to authenticated using (runway.is_editor() and (owner_email = runway.current_email() or runway.is_admin())) with check (runway.is_editor() and (owner_email = runway.current_email() or runway.is_admin()));
create policy "own Mii or admin: delete"        on runway.avatars          for delete to authenticated using (runway.is_editor() and (owner_email = runway.current_email() or runway.is_admin()));
-- Members read all moments (name tags, recap); each person writes their own; admins any member's.
create policy "editors read moments"            on runway.moments          for select to authenticated using (runway.is_editor());
create policy "own moment or admin: insert"     on runway.moments          for insert to authenticated with check (runway.is_editor() and (owner_email = runway.current_email() or runway.is_admin()));
create policy "own moment or admin: update"     on runway.moments          for update to authenticated using (runway.is_editor() and (owner_email = runway.current_email() or runway.is_admin())) with check (runway.is_editor() and (owner_email = runway.current_email() or runway.is_admin()));
create policy "own moment or admin: delete"     on runway.moments          for delete to authenticated using (runway.is_editor() and (owner_email = runway.current_email() or runway.is_admin()));
-- The schema itself is not secret (it's in the repo); the avatar maker reads it to build its picker.
create policy "anyone reads avatar_schema"      on runway.avatar_schema    for select to anon, authenticated using (true);

-- ───────────────────────────── public aggregates ─────────────────────────────

-- These views run with the owner's rights on purpose (no security_invoker): they are the only way
-- the anonymous page can see anything, and they expose nothing per person.

create view runway.public_runway as
with balance as (
  select amount, as_of, created_at from runway.opening_balances where as_of <= current_date order by as_of desc, created_at desc limit 1
), cost as (
  select amount from runway.monthly_costs where effective_from <= current_date order by effective_from desc limit 1
), paid as (
  select coalesce(sum(p.amount), 0) as total
  from runway.payments p, balance b
  where p.created_at > b.created_at and p.received_on <= current_date
)
select
  round(b.amount + paid.total - ((current_date - b.as_of) / 30.44) * cost.amount, 2) as funds,
  cost.amount as monthly_cost,
  b.as_of as balance_as_of,
  now() as computed_at
from balance b, cost, paid;
comment on view runway.public_runway is 'The two numbers the public page shows. Empty until an opening balance and a monthly cost exist.';

create view runway.public_avatars as
select spec - 'displayName' as spec
from runway.avatars
where (spec -> 'consent' ->> 'public')::boolean is true
order by id;
comment on view runway.public_avatars is 'Consented Mii looks only: the display name is stripped, so the public page never has anyone''s name.';

grant select on runway.public_runway, runway.public_avatars to anon, authenticated;

-- ───────────────────────────── AvatarSpec schema ─────────────────────────────
-- Generated from src/contracts/avatar.schema.json by `node scripts/avatar-schema-sql.mjs`.
-- avatar-schema-start
insert into runway.avatar_schema (id, schema) values (true, $avatar_schema${"$schema":"http://json-schema.org/draft-07/schema#","title":"AvatarSpec","description":"A Mii-style donor avatar. Parametric only: never store photos or photo-derived images here.","type":"object","additionalProperties":false,"required":["id","consent","head","hair","eyes","eyebrows","nose","mouth","glasses","facialHair","shirtColor","height"],"definitions":{"color":{"type":"string","pattern":"^#[0-9a-fA-F]{6}$"}},"properties":{"id":{"type":"string","pattern":"^[a-z0-9]+(-[a-z0-9]+)*$"},"displayName":{"type":"string","maxLength":40},"consent":{"type":"object","additionalProperties":false,"required":["public","givenOn"],"properties":{"public":{"const":true},"givenOn":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}$"}}},"head":{"type":"object","additionalProperties":false,"required":["shape","skinTone"],"properties":{"shape":{"enum":["round","oval","square","long","heart"]},"skinTone":{"$ref":"#/definitions/color"}}},"hair":{"type":"object","additionalProperties":false,"required":["style","color"],"properties":{"style":{"enum":["none","buzz","short","sidepart","curly","afro","long","ponytail","bun"]},"color":{"$ref":"#/definitions/color"}}},"eyes":{"type":"object","additionalProperties":false,"required":["style","color"],"properties":{"style":{"enum":["round","almond","narrow","wide","sleepy"]},"color":{"$ref":"#/definitions/color"}}},"eyebrows":{"enum":["straight","arched","thick","thin"]},"nose":{"enum":["small","button","long","wide"]},"mouth":{"enum":["smile","neutral","grin","small"]},"glasses":{"enum":["none","round","square","sunglasses"]},"facialHair":{"enum":["none","stubble","mustache","beard"]},"shirtColor":{"$ref":"#/definitions/color"},"height":{"type":"number","minimum":0.8,"maximum":1.2}}}$avatar_schema$::jsonb)
on conflict (id) do update set schema = excluded.schema, updated_at = now();
-- avatar-schema-end
