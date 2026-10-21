-- Runway data (MAN-71): monthly costs, opening balances, incoming payments and donor avatars.
--
-- Who may write: editors (public.is_editor(), from the auth migration). Anonymous visitors (the public
-- 3D page) get no policy on any table; they only read two aggregate views at the bottom of this file.
--
-- The funds rule, in one place (view public_runway):
--   funds = latest opening balance
--         + payments entered after that balance was recorded (and not dated in the future)
--         − months elapsed since the balance date × current monthly cost
-- The treasurer records a new opening balance whenever they reconcile with the bank; everything
-- entered before that moment is assumed to be in the bank balance, everything after it counts.

create extension if not exists pg_jsonschema with schema extensions;

-- ───────────────────────────── shared helpers ─────────────────────────────

create or replace function public.set_audit_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, public.current_email());
    new.created_at := coalesce(new.created_at, now());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ───────────────────────────── monthly costs ─────────────────────────────

create table public.monthly_costs (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 2) not null check (amount > 0),
  effective_from date not null unique,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.monthly_costs is 'What the office costs per month, as a history. The row with the latest effective_from <= today applies.';

-- ───────────────────────────── opening balances ─────────────────────────────

create table public.opening_balances (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 2) not null,
  as_of date not null unique,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.opening_balances is 'Bank balance at a date, set when reconciling. Payments entered before this row was created are assumed to be included in it.';

-- ───────────────────────────── avatars ─────────────────────────────

-- The AvatarSpec contract (src/contracts/avatar.schema.json), kept here so the database validates
-- what the crowd will render. A contract change is a migration that updates this row.
create table public.avatar_schema (
  id boolean primary key default true check (id), -- single row
  schema jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.avatars (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  spec jsonb not null check (spec ->> 'id' = id),
  -- The MM account this Mii belongs to: one Mii per person, edited by that person (or an admin).
  -- Never exposed to the public page (public_avatars returns spec only).
  owner_email text not null unique check (owner_email = lower(owner_email) and owner_email like '%@%'),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.avatars is 'One Mii per MM account, parametric only (never photo-derived). Public only while spec.consent.public is true. Withdrawn consent = delete the row the same day.';

create or replace function public.validate_avatar_spec()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  s jsonb;
begin
  select schema into s from public.avatar_schema limit 1;
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
  before insert or update on public.avatars
  for each row execute function public.validate_avatar_spec();

-- ───────────────────────────── payments ─────────────────────────────

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12, 2) not null check (amount > 0),
  received_on date not null default current_date,
  kind text not null default 'donation' check (kind in ('donation', 'sponsorship', 'other')),
  payer_name text,
  donor_id text references public.avatars (id) on delete set null,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.payments is 'Every euro that comes in. Private: only editors see rows; the public page sees the sum via public_runway.';
create index payments_received_on on public.payments (received_on);

-- ───────────────────────────── audit triggers ─────────────────────────────

create trigger set_audit_columns before insert or update on public.monthly_costs    for each row execute function public.set_audit_columns();
create trigger set_audit_columns before insert or update on public.opening_balances for each row execute function public.set_audit_columns();
create trigger set_audit_columns before insert or update on public.avatars          for each row execute function public.set_audit_columns();
create trigger set_audit_columns before insert or update on public.payments         for each row execute function public.set_audit_columns();

-- ───────────────────────────── row level security ─────────────────────────────

alter table public.monthly_costs    enable row level security;
alter table public.opening_balances enable row level security;
alter table public.avatars          enable row level security;
alter table public.payments         enable row level security;
alter table public.avatar_schema    enable row level security;

revoke all on public.monthly_costs, public.opening_balances, public.avatars, public.payments, public.avatar_schema from anon, authenticated;
grant select, insert, update, delete on public.monthly_costs, public.opening_balances, public.avatars, public.payments to authenticated;
grant select on public.avatar_schema to anon, authenticated;

create policy "editors manage monthly_costs"    on public.monthly_costs    for all to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "editors manage opening_balances" on public.opening_balances for all to authenticated using (public.is_editor()) with check (public.is_editor());
-- Every editor sees all Miis (for the name tags); each person writes only their own, admins any.
create policy "editors read avatars"            on public.avatars          for select to authenticated using (public.is_editor());
create policy "own Mii or admin: insert"        on public.avatars          for insert to authenticated with check (owner_email = public.current_email() or public.is_admin());
create policy "own Mii or admin: update"        on public.avatars          for update to authenticated using (owner_email = public.current_email() or public.is_admin()) with check (owner_email = public.current_email() or public.is_admin());
create policy "own Mii or admin: delete"        on public.avatars          for delete to authenticated using (owner_email = public.current_email() or public.is_admin());
create policy "editors manage payments"         on public.payments         for all to authenticated using (public.is_editor()) with check (public.is_editor());
-- The schema itself is not secret (it's in the repo); the avatar maker reads it to build its picker.
create policy "anyone reads avatar_schema"      on public.avatar_schema    for select to anon, authenticated using (true);

-- ───────────────────────────── public aggregates ─────────────────────────────

-- These views run with the owner's rights on purpose (no security_invoker): they are the only way
-- the anon key can see anything, and they expose nothing per person.

create view public.public_runway as
with balance as (
  select amount, as_of, created_at from public.opening_balances where as_of <= current_date order by as_of desc, created_at desc limit 1
), cost as (
  select amount from public.monthly_costs where effective_from <= current_date order by effective_from desc limit 1
), paid as (
  select coalesce(sum(p.amount), 0) as total
  from public.payments p, balance b
  where p.created_at > b.created_at and p.received_on <= current_date
)
select
  round(b.amount + paid.total - ((current_date - b.as_of) / 30.44) * cost.amount, 2) as funds,
  cost.amount as monthly_cost,
  b.as_of as balance_as_of,
  now() as computed_at
from balance b, cost, paid;
comment on view public.public_runway is 'The two numbers the public page shows. Empty until an opening balance and a monthly cost exist.';

create view public.public_avatars as
select spec - 'displayName' as spec
from public.avatars
where (spec -> 'consent' ->> 'public')::boolean is true
order by id;
comment on view public.public_avatars is 'Consented Mii looks only: the display name is stripped, so the public page never has anyone''s name.';

revoke all on public.public_runway, public.public_avatars from anon, authenticated;
grant select on public.public_runway, public.public_avatars to anon, authenticated;

-- ───────────────────────────── AvatarSpec schema ─────────────────────────────
-- Generated from src/contracts/avatar.schema.json by `node scripts/avatar-schema-sql.mjs`.
-- avatar-schema-start
insert into public.avatar_schema (id, schema) values (true, $avatar_schema${"$schema":"http://json-schema.org/draft-07/schema#","title":"AvatarSpec","description":"A Mii-style donor avatar. Parametric only: never store photos or photo-derived images here.","type":"object","additionalProperties":false,"required":["id","consent","head","hair","eyes","eyebrows","nose","mouth","glasses","facialHair","shirtColor","height"],"definitions":{"color":{"type":"string","pattern":"^#[0-9a-fA-F]{6}$"}},"properties":{"id":{"type":"string","pattern":"^[a-z0-9]+(-[a-z0-9]+)*$"},"displayName":{"type":"string","maxLength":40},"consent":{"type":"object","additionalProperties":false,"required":["public","givenOn"],"properties":{"public":{"const":true},"givenOn":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}$"}}},"head":{"type":"object","additionalProperties":false,"required":["shape","skinTone"],"properties":{"shape":{"enum":["round","oval","square","long","heart"]},"skinTone":{"$ref":"#/definitions/color"}}},"hair":{"type":"object","additionalProperties":false,"required":["style","color"],"properties":{"style":{"enum":["none","buzz","short","sidepart","curly","afro","long","ponytail","bun"]},"color":{"$ref":"#/definitions/color"}}},"eyes":{"type":"object","additionalProperties":false,"required":["style","color"],"properties":{"style":{"enum":["round","almond","narrow","wide","sleepy"]},"color":{"$ref":"#/definitions/color"}}},"eyebrows":{"enum":["straight","arched","thick","thin"]},"nose":{"enum":["small","button","long","wide"]},"mouth":{"enum":["smile","neutral","grin","small"]},"glasses":{"enum":["none","round","square","sunglasses"]},"facialHair":{"enum":["none","stubble","mustache","beard"]},"shirtColor":{"$ref":"#/definitions/color"},"height":{"type":"number","minimum":0.8,"maximum":1.2}}}$avatar_schema$::jsonb)
on conflict (id) do update set schema = excluded.schema, updated_at = now();
-- avatar-schema-end
