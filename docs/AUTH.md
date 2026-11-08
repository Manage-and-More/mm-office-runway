# Authentication

Only Manage and More people may change the runway data. The public 3D page never asks for a login.

## How it works

The runway uses the **shared M&M sign-in** of [mm-platform](https://github.com/Manage-and-More/mm-platform): one
account per person for every M&M app, and no passwords. You type your MM address, get a 6-digit code by email, and
type it in. Who may sign in at all (the allowed email domains) is decided once for every M&M app, in mm-platform.

```
MM member ──email──▶ code by email ──▶ Supabase Auth (mm-platform) ──JWT──▶ Data API + Row Level Security
                                       allowed domains (platform)          is_editor() / is_admin() (this repo)
```

| | Who | May |
|---|---|---|
| **Public viewer** | anyone on the website, no login | read the two aggregate views (`public_runway`, `public_avatars`) |
| **Editor** | anyone signed in whose address the platform allows | add payments, highlights, design their own Mii |
| **Admin** | editors listed in `runway.admins` | also edit/delete everything on `/admin/` and manage the admin list |

The rules live in the database, not in the pages: every write policy calls `runway.is_editor()`, which asks the
platform (`platform.is_email_allowed`) on every request, so an address the platform stops allowing loses access
here at once. Files: `db/migrations/` (tables, policies), `src/core/sign-in.js` (the code flow), `admin/` (the page).

This is a **browser-lane** app (mm-platform `docs/SECURITY.md` § 1): the pages talk to the database directly
with the publishable key, so Row Level Security is the only guard. `npm run db:migrate` (CI, every deploy) fails
if a table lacks RLS or a policy lets anyone write.

## What a login unlocks

- **The runway page itself** (top right): "Sign in", then "Add a highlight" (a highlight, or a donation that moves
  the runway at once), "My Mii" and "Recap" (one month's highlights as a one-minute show). Signed-in members also
  see name tags: "you" over their own Mii, a heart over Miis that donated, and names plus amounts on hover.
  Public viewers see plain Miis, no names.
- `/admin/`: admins only. Every payment, cost and balance with edit and delete, plus the admin list.
- `/tools/avatar-maker/`: "My Mii" as a full page (the popup embeds it). Locked for anyone not signed in.

## Managing access

- **New editor:** nothing to do. They sign in with their MM address; the first code creates their account.
- **Someone without an account yet:** an admin can add a highlight or raised money "for someone else" by MM
  address. A Mii is created for them (random look, no name, unclaimed). When they sign in with that address, the
  Mii and the moments are theirs. Identity is the email, one Mii per email.
- **New admin:** an admin enters their email on `/admin/` → "Make admin". Works before their first sign-in.
- **Remove an admin:** same page. An admin cannot remove themself, so the list can't become empty.
- **Someone leaves MM, or a new domain should be allowed:** that's the platform's job, for every app at once
  (mm-platform `docs/OPERATIONS.md`).
