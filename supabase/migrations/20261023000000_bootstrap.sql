-- Production bootstrap: the allowed sign-in domain and the first admin. Idempotent, so local
-- resets (which seed the same rows) and re-runs are fine. Further admins are added on /admin/.
insert into public.allowed_email_domains (domain, note) values ('manageandmore.de', 'Manage and More Google Workspace')
on conflict (domain) do nothing;
insert into public.admins (email, added_by) values ('arnav.singh@manageandmore.de', 'bootstrap')
on conflict (email) do nothing;
