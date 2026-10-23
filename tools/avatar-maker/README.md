# Workstream: Avatars (Mii editor)

**Owns:** `tools/avatar-maker/`, `data/avatars/`. **Contract:** [`src/contracts/avatar.schema.json`](../../src/contracts/avatar.schema.json).

## What it is

`/tools/avatar-maker/` is **My Mii**: every signed-in Manage and More member designs the one Mii that
represents them on the runway page (also reachable from the "My Mii" button on the page itself, as a
popup). A picker generated from the schema's enums, a live 3D preview with the crowd's real `buildMii`,
and Save / Remove against the Supabase `avatars` table. One Mii per account, enforced by the database;
the id is derived from the account (`arnav.singh@…` → `arnav-singh`).

The crowd on the page shows real people's Miis only. The demo crowd fills in only while nobody has a Mii yet.

## Privacy rules (hard requirements)

- **No photos anywhere.** The editor has no photo input; a Mii is picked by hand.
- Saving is the consent: the disclaimer under Save says "By clicking Save, you agree to appear publicly.
  It won't show your name." The saved spec carries `consent.public: true` and the date of first save,
  which the schema and the database require.
- No photo-derived textures: parameters only.
- The display name is optional and only ever shown to signed-in members. The public view strips it.
- **Withdrawn consent:** the person presses "Remove my Mii". The row is deleted and the Mii leaves the page
  on its next load. No admin step.

## Workflow

1. Sign in on the runway page, press "My Mii".
2. Pick a look (or roll a random one), optionally a name other members will see, and save.
3. Reload the page: you walk around the garden, with "you" over your head while signed in.

## Changing the options (a contract change)

A new hairstyle or accessory is an enum value in `src/contracts/avatar.schema.json`:

1. Agree it with the crowd workstream owner (they render it; unknown values fall back to a default, never throw).
2. Edit the schema, then add a migration with the output of `node scripts/avatar-schema-sql.mjs` so the
   database validates the same contract. `npm run check` fails until both match.
3. The editor picks the new value up automatically: the form is generated from the schema.

## Fallback files

`data/avatars/*.json` are the samples and the offline fallback (`npm run avatars` bundles them into
`data/avatar-index.json`, which the page uses only when Supabase is unreachable). Delete the `sample-*`
files once real donors are in the database.
