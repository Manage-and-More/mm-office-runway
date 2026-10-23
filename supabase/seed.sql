-- Local development seed (runs on `supabase db reset`, never in production).
-- Production bootstrap: see docs/AUTH.md (first admin) and docs/DATABASE.md (first numbers).
insert into public.allowed_email_domains (domain, note) values ('manageandmore.de', 'Manage and More Google Workspace') on conflict (domain) do nothing;
insert into public.admins (email, added_by) values ('arnav.singh@manageandmore.de', 'seed') on conflict (email) do nothing;

-- Local test logins (see docs/AUTH.md, "Local test accounts"). Password for both: mm-runway-local
-- The domain guard runs here too, so these must be on an allowed domain.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'arnav.singh@manageandmore.de', crypt('mm-runway-local', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'editor@manageandmore.de', crypt('mm-runway-local', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
from auth.users where email in ('arnav.singh@manageandmore.de', 'editor@manageandmore.de');

-- Today's numbers from data.json, as an opening balance 10 days ago plus two payments since.
insert into public.monthly_costs (amount, effective_from, note, created_by) values (7208, '2026-01-01', 'rent + utilities', 'seed');
insert into public.opening_balances (amount, as_of, note, created_by) values (62000, current_date - 10, 'bank statement', 'seed');
insert into public.payments (amount, received_on, kind, payer_name, note, created_by) values
  (3000, current_date - 5, 'sponsorship', 'Example Sponsor GmbH', 'Q4 sponsoring', 'seed'),
  (2200, current_date - 1, 'donation', 'Sample Ada', null, 'seed');

-- The sample Miis from data/avatars/, so the crowd shows the same faces locally. Kai is "you" for the local admin.
insert into public.avatars (id, spec, owner_email, created_by) values
  ('sample-ada', $spec${"id":"sample-ada","displayName":"Sample Ada","consent":{"public":true,"givenOn":"2026-09-18"},"head":{"shape":"oval","skinTone":"#f1c7a3"},"hair":{"style":"bun","color":"#6b3e26"},"eyes":{"style":"almond","color":"#3b5b7a"},"eyebrows":"arched","nose":"small","mouth":"smile","glasses":"round","facialHair":"none","shirtColor":"#00a2cc","height":0.95}$spec$::jsonb, 'editor@manageandmore.de', 'seed'),
  ('sample-kai', $spec${"id":"sample-kai","displayName":"Sample Kai","consent":{"public":true,"givenOn":"2026-09-18"},"head":{"shape":"square","skinTone":"#8d5a3b"},"hair":{"style":"afro","color":"#1b1b1b"},"eyes":{"style":"round","color":"#2b1d14"},"eyebrows":"thick","nose":"wide","mouth":"grin","glasses":"none","facialHair":"stubble","shirtColor":"#ff4fd8","height":1.1}$spec$::jsonb, 'arnav.singh@manageandmore.de', 'seed'),
  ('sample-noor', $spec${"id":"sample-noor","consent":{"public":true,"givenOn":"2026-09-18"},"head":{"shape":"heart","skinTone":"#c89572"},"hair":{"style":"long","color":"#2e1b10"},"eyes":{"style":"wide","color":"#4a3222"},"eyebrows":"thin","nose":"button","mouth":"small","glasses":"none","facialHair":"none","shirtColor":"#7cffcb","height":0.9}$spec$::jsonb, 'sample.noor@manageandmore.de', 'seed');
