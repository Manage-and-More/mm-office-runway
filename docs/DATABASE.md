# Database (MAN-71)

The runway numbers and the donor Miis live in schema `runway` of the shared M&M Supabase project
([mm-platform](https://github.com/Manage-and-More/mm-platform), browser lane). The public page reads two aggregate
views with the publishable key; editors change the underlying tables on the page and on `/admin/` (see
[AUTH.md](AUTH.md)).

## Tables

| Table | What it holds | Who reads | Who writes |
|---|---|---|---|
| `monthly_costs` | Cost per month with an `effective_from` date; the latest row ≤ today applies | editors | editors |
| `opening_balances` | Bank balance at a date, recorded when reconciling | editors | editors |
| `payments` | Every incoming payment: amount, date, kind (donation / sponsorship / other), payer name, optional link to a Mii, note | editors | editors |
| `avatars` | One Mii per MM account: the `AvatarSpec` as JSON plus the `owner_email` it belongs to (unique). `claimed` is false while an admin-created Mii waits for its owner | editors | the owner, or admins |
| `moments` | Members' highlights ("5 lecture visits"), one line of text with a date; table name `moments`. Never public | editors | the owner, or admins for anyone (delete: owner or admins) |
| `avatar_schema` | The `AvatarSpec` JSON schema, so the database validates what the crowd renders | everyone | migrations only |

"Editors" means anyone signed in with an address the platform allows (see [AUTH.md](AUTH.md)).

Every row records `created_by` (the editor's email) and `updated_at` automatically.

## The funds rule

```
funds = latest opening balance
      + payments entered after that balance was recorded (and not dated in the future)
      − months elapsed since the balance date × current monthly cost        (a month is 30.44 days)
```

It lives in the view `public_runway` and nowhere else. When the treasurer reconciles with the bank, they
add a new opening balance; everything entered before that moment is assumed to be in the bank balance,
and every payment entered afterwards counts, whatever date it carries (as long as it isn't in the future).
So adding a payment always moves the number, and reconciling never double-counts.

## What the public page sees

- `public_runway`: `funds`, `monthly_cost`, `balance_as_of`, `computed_at`. One row, or none until an opening
  balance and a monthly cost exist (then the page falls back to the Google Sheet, then `data.json`).
- `public_avatars`: the `spec` of every avatar whose `consent.public` is true, with the display name
  stripped. Nothing else: no names, no owner emails, no payment links.

These two views run with the owner's rights on purpose. The base tables have Row Level Security with
no policy for anonymous users, so the publishable key cannot read a single payment or avatar row directly.
`e2e/runway.spec.mjs` proves this against a local stack on every PR.

## Source order on the page

`src/core/data-source.js`: Supabase → published Google Sheet → `data.json`. `src/core/avatars.js`:
Supabase → `data/avatar-index.json`. A failing source logs a warning and the next one is tried, so the
live page never goes blank during the cut-over, and the sheet can be retired later by clearing
`sheetCsvUrl` in `config.js`.

## Changing the schema

- Add a file in `db/migrations/` named `<UTC timestamp>_<what>.sql` (e.g. `20261201120000_add_goal.sql`). Never
  change the database in the Supabase dashboard, and never edit a migration that is already on `main`.
- Write it against schema `runway` (`create table runway.x …`), with RLS on, explicit grants and a policy that
  checks the person (`runway.is_editor()`, `owner_email = runway.current_email()`, `runway.is_admin()`).
- `npm run db:migrate` applies it locally; CI applies it to production before each deploy. Both fail if the
  schema breaks the browser-lane rules (mm-platform `docs/SECURITY.md` § 1).
- An `AvatarSpec` contract change (new hairstyle, …) edits `src/contracts/avatar.schema.json` **and** needs a
  migration with the output of `node scripts/avatar-schema-sql.mjs`. `npm run check` fails until both match.

## First numbers in production

(Done in 2026: the data moved over from the runway's earlier Supabase project with mm-platform's
`npm run app:import`.) For a fresh start, sign in on `/admin/` and enter, once:

1. **Monthly cost**: one number. Saving it starts a new row from today; earlier rows stay as history.
2. **Bank balance**: one number, today's balance. Saving it records the moment, and payments entered
   afterwards count on top of it.

The "Runway now" line on the page shows the result immediately, and the public page follows within one
poll (60 s). From then on, editors add payments as they arrive and a new opening balance whenever they
reconcile with the bank. Every row can be edited (payments) or deleted (all) to fix mistakes.

## Local development

Run the shared platform locally once (mm-platform `README.md` → local setup; needs Docker), then here:

```bash
npm ci
export DATABASE_URL=postgresql://runway_app:local@127.0.0.1:54322/postgres
npm run db:migrate && npm run db:seed   # schema + sample numbers, Miis, and admin@example.com as admin
PORT=8090 npm run dev
```

Open **http://localhost:8090/admin/?local** once: `?local` points every page on that origin at the local stack
(remembered in the browser), `?live` switches back to `config.js`. Sign in as `admin@example.com` (admin) or any
`@example.com` address (editor); the codes land in the local inbox at http://127.0.0.1:54324, never in a real
mailbox. `npm run test:e2e` runs the same checks as CI.
