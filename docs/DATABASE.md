# Database (MAN-71)

The runway numbers and the donor Miis live in Supabase (Postgres). The public page reads two aggregate
views with the anon key; editors change the underlying tables on `/admin/` (see [AUTH.md](AUTH.md)).

## Tables

| Table | What it holds | Who reads | Who writes |
|---|---|---|---|
| `monthly_costs` | Cost per month with an `effective_from` date; the latest row ≤ today applies | editors | editors |
| `opening_balances` | Bank balance at a date, recorded when reconciling | editors | editors |
| `payments` | Every incoming payment: amount, date, kind (donation / sponsorship / other), payer name, optional link to a Mii, note | editors | editors |
| `avatars` | One Mii per MM account: the `AvatarSpec` as JSON plus the `owner_email` it belongs to (unique) | editors | the owner, or admins |
| `avatar_schema` | The `AvatarSpec` JSON schema, so the database validates what the crowd renders | everyone | migrations only |

"Editors" means anyone signed in with a Manage and More account (see [AUTH.md](AUTH.md)).

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
no policy for anonymous users, so the anon key cannot read a single payment or avatar row directly.
`scripts/check-policies.sh` proves this against a local stack.

## Source order on the page

`src/core/data-source.js`: Supabase → published Google Sheet → `data.json`. `src/core/avatars.js`:
Supabase → `data/avatar-index.json`. A failing source logs a warning and the next one is tried, so the
live page never goes blank during the cut-over, and the sheet can be retired later by clearing
`sheetCsvUrl` in `config.js`.

## Changing the schema

- Add a file in `supabase/migrations/` (`npx supabase migration new <name>`), never edit the Studio.
- Apply locally with `npx supabase db reset`, in production with `npx supabase db push`.
- An `AvatarSpec` contract change (new hairstyle, …) edits `src/contracts/avatar.schema.json` **and** needs a
  migration with the output of `node scripts/avatar-schema-sql.mjs`. `npm run check` fails until both match.

## First numbers in production

After the project exists and the migrations are pushed, sign in on `/admin/` and enter, once:

1. **Monthly cost**: one number. Saving it starts a new row from today; earlier rows stay as history.
2. **Bank balance**: one number, today's balance. Saving it records the moment, and payments entered
   afterwards count on top of it.

The "Runway now" line on the page shows the result immediately, and the public page follows within one
poll (60 s). From then on, editors add payments as they arrive and a new opening balance whenever they
reconcile with the bank. Every row can be edited (payments) or deleted (all) to fix mistakes.

## Local development

`npx supabase start` applies the migrations and `supabase/seed.sql`: an opening balance ten days ago,
two payments, the sample Miis, and the editors from AUTH.md. Point the page at it from the browser
console (see AUTH.md, "Local development"); the Simulate panel's "back to live data" re-reads the database.
