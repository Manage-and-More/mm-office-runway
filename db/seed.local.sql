-- Local development and CI only (npm run db:seed refuses anything but a local database).
-- The first admin and today's numbers from data.json; production data came from the old project
-- (mm-platform: npm run app:import) and is edited on /admin/.
insert into runway.admins (email, added_by) values ('admin@example.com', 'seed') on conflict (email) do nothing;

-- An opening balance 10 days ago plus two payments since.
insert into runway.monthly_costs (amount, effective_from, note, created_by) values (7208, '2026-01-01', 'rent + utilities', 'seed');
insert into runway.opening_balances (amount, as_of, note, created_by) values (62000, current_date - 10, 'bank statement', 'seed');
insert into runway.payments (amount, received_on, kind, payer_name, note, created_by) values
  (3000, current_date - 5, 'sponsorship', 'Example Sponsor GmbH', 'Q4 sponsoring', 'seed'),
  (2200, current_date - 1, 'donation', 'Sample Ada', null, 'seed');

-- The sample Miis from data/avatars/, so the crowd shows the same faces locally. Kai is "you" for the local admin (admin@example.com).
insert into runway.avatars (id, spec, owner_email, created_by) values
  ('sample-ada', $spec${"id":"sample-ada","displayName":"Sample Ada","consent":{"public":true,"givenOn":"2026-09-18"},"head":{"shape":"oval","skinTone":"#f1c7a3"},"hair":{"style":"bun","color":"#6b3e26"},"eyes":{"style":"almond","color":"#3b5b7a"},"eyebrows":"arched","nose":"small","mouth":"smile","glasses":"round","facialHair":"none","shirtColor":"#00a2cc","height":0.95}$spec$::jsonb, 'editor@example.com', 'seed'),
  ('sample-kai', $spec${"id":"sample-kai","displayName":"Sample Kai","consent":{"public":true,"givenOn":"2026-09-18"},"head":{"shape":"square","skinTone":"#8d5a3b"},"hair":{"style":"afro","color":"#1b1b1b"},"eyes":{"style":"round","color":"#2b1d14"},"eyebrows":"thick","nose":"wide","mouth":"grin","glasses":"none","facialHair":"stubble","shirtColor":"#ff4fd8","height":1.1}$spec$::jsonb, 'admin@example.com', 'seed'),
  ('sample-noor', $spec${"id":"sample-noor","consent":{"public":true,"givenOn":"2026-09-18"},"head":{"shape":"heart","skinTone":"#c89572"},"hair":{"style":"long","color":"#2e1b10"},"eyes":{"style":"wide","color":"#4a3222"},"eyebrows":"thin","nose":"button","mouth":"small","glasses":"none","facialHair":"none","shirtColor":"#7cffcb","height":0.9}$spec$::jsonb, 'sample.noor@example.com', 'seed');
