# Authentication (MAN-72)

Only authorised Manage and More people may change the runway data. The public 3D page never asks for a login.

## How it works

```
MM member ──email + password──▶ Supabase Auth ──JWT──▶ PostgREST + Row Level Security
            confirm email first   domain guard trigger     is_editor() / is_admin()
```

Three kinds of people, nothing more:

| | Who | May |
|---|---|---|
| **Public viewer** | anyone on the website, no login | read the two aggregate views (`public_runway`, `public_avatars`) |
| **Editor** | anyone signed in with a confirmed Manage and More account | add payments, design their own Mii |
| **Admin** | editors listed in `public.admins` | also edit/delete everything on `/admin/` and manage the admin list and allowed domains |

Same sign-in flow as the reimbursement tool (sign up with your MM address, confirm the email, log in), with
the restriction enforced inside the database rather than only in the browser:

1. **Database domain guard.** A trigger on `auth.users` rejects any new account whose domain is not in
   `public.allowed_email_domains`. The sign-up form shows the same rule early (`config.supabase.allowedEmailDomains`),
   but the trigger is what counts: skipping the form doesn't help.
2. **Email confirmation.** Nobody can log in until they've opened the link sent to that MM address.
3. **Row Level Security.** Every write policy calls `is_editor()` (signed in with an MM account); the admin list
   and the domains need `is_admin()`. Nothing in the pages grants access, they only show what the database allows.

**Google sign-in** is built into the page and hidden (`config.supabase.googleSignIn: false`). Turning it on needs a
Google OAuth client inside the MM Workspace organisation, which currently requires the UnternehmerTUM admin to grant
project-creation rights. The same roles apply to both sign-in methods; see "Optional: Google" below.

Files: `supabase/migrations/*_auth_editors.sql` (tables, policies, trigger), `admin/` (the page),
`config.js` → `supabase` (URL, anon key, domain hint, Google toggle).

## One-time setup (MM-owned accounts, never personal ones)

1. In the MM-owned Supabase organisation (MAN-18), create the project.
2. **Authentication → Providers → Email**: enabled, "Confirm email" on.
3. **Authentication → URL configuration**: site URL `https://manage-and-more.github.io/mm-office-runway/admin/`;
   add the same URL plus `http://localhost:8080/admin/` to redirect URLs (confirmation and reset links return there).
4. Apply the migrations from this repo (`npx supabase link --project-ref <ref>` then `npx supabase db push`).
   Never create tables by hand in the Studio.
5. Bootstrap the first admin once, in the SQL editor:
   ```sql
   insert into public.allowed_email_domains (domain) values ('manageandmore.de');
   insert into public.admins (email, added_by) values ('first.last@manageandmore.de', 'bootstrap');
   ```
6. Put the project URL and **anon** key into `config.js` → `supabase`. The anon key is meant to be public; the
   **service-role key never goes near the repo or the browser.**
7. Supabase's built-in mailer is rate-limited (a few emails per hour) and fine for a handful of editors. If sign-ups
   get stuck, configure custom SMTP under **Authentication → SMTP** (the reimbursement tool uses Mailjet).

### Optional: Google

1. Signed in with an `@manageandmore.de` account, create a Google Cloud project inside the Workspace organisation
   (needs the "Project Creator" role from the UnternehmerTUM admin). **OAuth consent screen**: user type **Internal**.
2. **Credentials → OAuth client ID → Web application**, redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
3. **Supabase → Authentication → Providers → Google**: paste client ID and secret.
4. Set `googleSignIn: true` in `config.js`. "Internal" covers the whole UnternehmerTUM Workspace; the domain guard
   still limits accounts to the allowed domains.

## Local development

```bash
npx supabase start          # Docker: Postgres, Auth, PostgREST, Mailpit (migrations + seed.sql applied)
PORT=8090 npm run dev       # or any free port
```

Then open **http://localhost:8090/admin/?local** once. The `?local` switch points every page on that
origin at the local stack (remembered in the browser); `?live` switches back to `config.js`.

### Local test accounts

Created by `supabase/seed.sql` on every `npx supabase start` / `db reset`, so they always exist locally.
They don't exist in production.

| Email | Password | Role |
|---|---|---|
| `arnav.singh@manageandmore.de` | `mm-runway-local` | admin |
| `editor@manageandmore.de` | `mm-runway-local` | editor |

You can also create more accounts with "Create account": confirmation and password-reset emails land in
the local inbox at http://127.0.0.1:54324, never in a real mailbox.

## What a login unlocks

- **The runway page itself** (top right): "Sign in", then "Add payment" (the page reacts at once) and "Miis"
  (the editor in a popup). Signed-in members also see name tags: "you" over their own Mii, a heart over
  Miis that donated, and names plus amounts on hover. Public viewers see plain Miis, no names.
- `/admin/`: admins only. Every payment, cost and balance with edit and delete, plus the admin list and domains.
- `/tools/avatar-maker/`: "My Mii" as a full page (the popup embeds it): one Mii per account, yours to edit. Locked for anyone not signed in.

## Managing access

- **New editor:** nothing to do. They create their own account on `/admin/` with their MM address and confirm the email.
- **New admin:** an admin enters their email on `/admin/` → "Make admin". Works before their first sign-in.
- **Remove an admin:** same page. An admin cannot remove themself, so the list can't become empty.
- **Someone leaves MM:** delete their account in Supabase → Authentication → Users (their session expires within an hour anyway),
  and remove them from the admin list if they were on it.

## Checking the policies

`scripts/check-policies.sh` runs against a local stack (`npx supabase start`) and proves, with real JWTs:
anonymous requests read only the two public views and are denied on every table; an outsider address is
rejected at sign-up; an editor can change data but not the admin list; an admin can manage the list but not
remove themself.
